import { MSG } from '../shared/messages';
import {
  getProviderConfig,
  saveProviderConfig,
  getProviderConfigById,
  getLastMode,
  saveLastMode,
  saveTask,
  getTask,
  urlHash,
} from '../shared/storage';
import { getCachedTranslation, saveTranslationCache } from './cache';
import { startKeepalive, stopKeepalive, setupPortKeepalive } from './keepalive';
import { translate } from './pipeline';
import type { TranslationTask, TranslationMode, ParagraphTranslation, ProviderConfig } from '../shared/types';

setupPortKeepalive();
recoverCrashedTask();

let activeTaskId: string | null = null;

async function recoverCrashedTask(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const taskKeys = Object.keys(all).filter((k) => k.startsWith('task_') && !k.startsWith('task_active_'));

  for (const key of taskKeys) {
    const task = all[key] as TranslationTask;
    if (task.status !== 'completed' && task.status !== 'failed') {
      task.status = 'paused';
      await chrome.storage.local.set({ [key]: task });
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case MSG.GET_PROVIDER_CONFIG:
      getProviderConfig().then(sendResponse);
      return true;

    case MSG.GET_PROVIDER_CONFIG_BY_ID:
      getProviderConfigById(payload as string).then(sendResponse);
      return true;

    case MSG.SAVE_PROVIDER_CONFIG:
      saveProviderConfig(payload as ProviderConfig).then(() => sendResponse({ ok: true }));
      return true;

    case MSG.GET_LAST_MODE:
      getLastMode().then(sendResponse);
      return true;

    case 'SAVE_LAST_MODE':
      if (payload) saveLastMode(payload as TranslationMode);
      return false;

    case MSG.START_TRANSLATION:
      handleStartTranslation(payload as { mode: TranslationMode }, sender).then(sendResponse);
      return true;

    case MSG.GET_TASK_STATUS:
      handleGetTaskStatus(payload as { url: string }).then(sendResponse);
      return true;

    case MSG.CANCEL_TRANSLATION:
      handleCancelTranslation().then(sendResponse);
      return true;

    case MSG.RETRY_TRANSLATION:
      handleRetryTranslation().then(sendResponse);
      return true;

    case MSG.CONTENT_READY:
      // Content script ready
      return false;

    default:
      return false;
  }
});

async function handleStartTranslation(
  payload: { mode: TranslationMode },
  _sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { error: 'No active tab' };
  const tabId = tab.id;

  const url = tab.url;
  if (!url) return { error: 'No URL' };

  const config = await getProviderConfig();
  if (!config?.apiKey) return { error: '请先配置 API Key' };

  activeTaskId = crypto.randomUUID();
  const task: TranslationTask = {
    id: activeTaskId,
    url,
    mode: payload.mode,
    status: 'pending',
    translations: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const hash = urlHash(url);
  await saveTask(hash, task);

  // Check cache first
  const cached = await getCachedTranslation(url);
  if (cached) {
    task.status = 'completed';
    task.translations = cached.translations;
    await saveTask(hash, task);
    await sendToTab(tabId, MSG.TRANSLATION_COMPLETE, { translations: cached.translations });
    return { taskId: task.id };
  }

  // Extract content from page
  let extraction: { paragraphs: ParagraphTranslation[]; fullText: string } | null = null;
  try {
    extraction = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
  } catch {
    return { error: '无法提取页面内容' };
  }

  if (!extraction || !extraction.paragraphs.length) {
    return { error: '无法识别页面正文内容' };
  }

  task.translations = extraction.paragraphs;
  await saveTask(hash, task);

  startKeepalive();
  setBadge('翻译中');

  // Run translation in background
  runTranslation(task, extraction.fullText, config, tabId, hash).catch(async (err) => {
    task.status = 'failed';
    task.error = {
      step: task.currentStep ?? 'translate',
      batchIndex: task.currentBatch ?? 0,
      message: err instanceof Error ? err.message : String(err),
      retryCount: 0,
      maxRetries: 2,
    };
    await saveTask(hash, task);
    await sendToTab(tabId, MSG.TRANSLATION_ERROR, { message: task.error.message });
    clearBadge();
    stopKeepalive();
  });

  return { taskId: task.id };
}

async function runTranslation(
  task: TranslationTask,
  fullText: string,
  config: ProviderConfig,
  tabId: number,
  hash: string,
): Promise<void> {
  const provider = { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model };

  const translations = await translate(task.translations, task.mode, provider, {
    fullText,
    onProgress: (progress) => {
      if (progress.batchProgress) {
        sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, {
          step: '正在翻译',
          progress: `${progress.batchProgress.current}/${progress.batchProgress.total} 批`,
        });
      } else {
        const stepName = progress.step === 'analyze' ? '正在分析'
          : progress.step === 'translate' ? '正在翻译'
          : progress.step;
        sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: stepName });
      }
    },
  });

  task.translations = translations;
  task.status = 'completed';
  await updateTask(hash, task);

  // Save to cache
  await saveTranslationCache(task.url, translations, task.mode, config.id);

  await sendToTab(tabId, MSG.TRANSLATION_COMPLETE, { translations });
  await sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: '完成' });
  setTimeout(() => sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: 'hide' }), 2000);

  setBadge('完成');
  setTimeout(clearBadge, 5000);
  stopKeepalive();
}

async function updateTask(hash: string, task: TranslationTask): Promise<void> {
  task.updatedAt = Date.now();
  await saveTask(hash, task);
}

async function handleGetTaskStatus(payload: { url: string }): Promise<unknown> {
  if (!payload?.url) return null;
  const hash = urlHash(payload.url);
  return getTask(hash);
}

async function handleCancelTranslation(): Promise<unknown> {
  activeTaskId = null;
  stopKeepalive();
  clearBadge();
  return { ok: true };
}

async function handleRetryTranslation(): Promise<unknown> {
  // TODO: Implement retry from checkpoint
  return { ok: true };
}

async function sendToTab(tabId: number, type: string, payload: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type, payload });
  } catch {
    // Tab may have been closed
  }
}

function setBadge(text: string): void {
  chrome.action.setBadgeText({ text: text.slice(0, 4) });
  chrome.action.setBadgeBackgroundColor({ color: '#1a1a1a' });
}

function clearBadge(): void {
  chrome.action.setBadgeText({ text: '' });
}
