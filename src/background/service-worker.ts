import { MSG } from '../shared/messages';
import {
  getProviderConfig,
  saveProviderConfig,
  getProviderConfigById,
  getLastMode,
  saveLastMode,
  saveTask,
  getTask,
  removeTask,
  getCachedTranslation,
  saveCachedTranslation,
} from '../shared/storage';
import { translate, AbortError } from './pipeline';
import type { TranslationTask, TranslationMode, ParagraphTranslation, ProviderConfig } from '../shared/types';

// Keepalive: inlined from keepalive.ts
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepalive(): void {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo?.();
  }, 25000);
}

function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    port.onDisconnect.addListener(() => {});
  }
});

recoverCrashedTask();

let activeTaskId: string | null = null;
let activeUrl: string | null = null;
let abortController: AbortController | null = null;

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
  abortController = new AbortController();
  activeUrl = url;
  const task: TranslationTask = {
    id: activeTaskId,
    url,
    mode: payload.mode,
    status: 'pending',
    translations: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveTask(url, task);

  const cached = await getCachedTranslation(url);
  if (cached) {
    task.status = 'completed';
    task.translations = cached.translations;
    await saveTask(url, task);
    await sendToTab(tabId, MSG.TRANSLATION_COMPLETE, { translations: cached.translations }, abortController);
    return { taskId: task.id };
  }

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
  await saveTask(url, task);

  startKeepalive();
  setBadge('翻译中');

  runTranslation(task, extraction.fullText, config, tabId, abortController.signal).catch(async (err) => {
    if (err instanceof AbortError) {
      clearBadge();
      stopKeepalive();
      return;
    }

    task.status = 'failed';
    task.error = {
      step: task.currentStep ?? 'translate',
      batchIndex: task.currentBatch ?? 0,
      message: err instanceof Error ? err.message : String(err),
      retryCount: 0,
      maxRetries: 2,
    };
    await saveTask(url, task);
    await sendToTab(tabId, MSG.TRANSLATION_ERROR, { message: task.error.message }, abortController);
    clearBadge();
    stopKeepalive();
  });

  return { taskId: task.id };
}

const STEP_NAMES: Record<string, string> = {
  analyze: '正在分析',
  translate: '正在翻译',
};

function stepName(step: string): string {
  return STEP_NAMES[step] ?? step;
}

async function runTranslation(
  task: TranslationTask,
  fullText: string,
  config: ProviderConfig,
  tabId: number,
  signal: AbortSignal,
): Promise<void> {
  abortController = new AbortController();
  const provider = { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model };

  const translations = await translate(task.translations, task.mode, provider, {
    fullText,
    signal,
    onProgress: (progress) => {
      if (progress.batchProgress) {
        sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, {
          step: '正在翻译',
          progress: `${progress.batchProgress.current}/${progress.batchProgress.total} 批`,
        }, abortController);
      } else {
        sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: stepName(progress.step) }, abortController);
      }
    },
  });

  task.translations = translations;
  task.status = 'completed';
  task.updatedAt = Date.now();
  await saveTask(task.url, task);

  await saveCachedTranslation(task.url, translations, task.mode, config.id);

  await sendToTab(tabId, MSG.TRANSLATION_COMPLETE, { translations }, abortController);
  await sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: '完成' }, abortController);
  setTimeout(() => sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: 'hide' }, abortController), 2000);

  setBadge('完成');
  setTimeout(clearBadge, 5000);
  stopKeepalive();
}

async function handleGetTaskStatus(payload: { url: string }): Promise<unknown> {
  if (!payload?.url) return null;
  return getTask(payload.url);
}

async function handleCancelTranslation(): Promise<unknown> {
  abortController?.abort();
  abortController = null;
  activeTaskId = null;

  if (activeUrl) {
    await removeTask(activeUrl);
    await sendToTabForCurrentPage(MSG.CLEAR_TRANSLATIONS, {});
    activeUrl = null;
  }

  stopKeepalive();
  clearBadge();
  return { ok: true };
}

async function sendToTabForCurrentPage(type: string, payload: unknown): Promise<void> {
  if (!activeUrl) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type, payload });
    } catch {
      // Tab may have been closed
    }
  }
}

async function handleRetryTranslation(): Promise<unknown> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { error: 'No active tab' };
  const tabId = tab.id;

  const url = tab.url;
  if (!url) return { error: 'No URL' };

  const task = await getTask(url);

  if (!task) {
    return { ok: true };
  }

  await sendToTab(tabId, MSG.CLEAR_TRANSLATIONS, {});

  const config = await getProviderConfig();
  if (!config?.apiKey) return { error: '请先配置 API Key' };

  abortController?.abort();
  abortController = new AbortController();
  activeTaskId = task.id;

  startKeepalive();
  setBadge('翻译中');

  runTranslation(task, '', config, tabId, abortController.signal).catch(async (err) => {
    task.status = 'failed';
    task.error = {
      step: task.currentStep ?? 'translate',
      batchIndex: task.currentBatch ?? 0,
      message: err instanceof Error ? err.message : String(err),
      retryCount: 0,
      maxRetries: 2,
    };
    await saveTask(url, task);
    await sendToTab(tabId, MSG.TRANSLATION_ERROR, { message: task.error.message }, abortController);
    clearBadge();
    stopKeepalive();
  });

  return { ok: true };
}

export async function sendToTab(tabId: number, type: string, payload: unknown, controller?: AbortController | null): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type, payload });
  } catch {
    controller?.abort();
  }
}

function setBadge(text: string): void {
  chrome.action.setBadgeText({ text: text.slice(0, 4) });
  chrome.action.setBadgeBackgroundColor({ color: '#1a1a1a' });
}

function clearBadge(): void {
  chrome.action.setBadgeText({ text: '' });
}
