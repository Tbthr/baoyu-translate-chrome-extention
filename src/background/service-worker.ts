import { MSG } from '../shared/messages';
import {
  getProviderConfig,
  saveProviderConfig,
  getLastMode,
  saveLastMode,
  saveTask,
  getTask,
  removeTask,
  urlHash,
} from '../shared/storage';
import { getCachedTranslation, saveTranslationCache } from './cache';
import { startKeepalive, stopKeepalive, setupPortKeepalive } from './keepalive';
import { quickTranslate, analyzeArticle, translateWithContext, reviewTranslations, polishTranslations } from './translator';
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
  const mode = task.mode;

  let translations = task.translations;

  if (mode === 'quick') {
    task.status = 'translating';
    task.currentStep = 'translate';
    await updateTask(hash, task);

    await sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: '正在翻译...' });

    translations = await quickTranslate(translations, fullText, provider);

    task.translations = translations;
    task.status = 'completed';
    await updateTask(hash, task);
  } else {
    // Normal / Refined: analyze first
    task.status = 'analyzing';
    task.currentStep = 'analyze';
    await updateTask(hash, task);

    await sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: '正在分析...' });

    const analysis = await analyzeArticle(fullText, provider);
    task.analysis = analysis;
    await updateTask(hash, task);

    // Translate with context
    task.status = 'translating';
    task.currentStep = 'translate';
    await updateTask(hash, task);

    const batches = splitIntoBatches(translations);
    task.totalBatches = batches.length;

    for (let i = 0; i < batches.length; i++) {
      task.currentBatch = i + 1;
      await updateTask(hash, task);
      await sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, {
        step: '正在翻译',
        progress: `${i + 1}/${batches.length} 批`,
      });

      const batchResult = await translateWithContext(batches[i], analysis, provider, mode);

      // Merge batch results
      for (const t of batchResult) {
        const idx = translations.findIndex((p) => p.index === t.index);
        if (idx >= 0) translations[idx] = t;
      }

      task.translations = translations;
      await updateTask(hash, task);
      await sendToTab(tabId, MSG.INJECT_TRANSLATION, { translations: batchResult, isDraft: mode === 'refined' });
    }

    if (mode === 'refined') {
      // Review step
      task.status = 'reviewing';
      task.currentStep = 'review';
      await updateTask(hash, task);
      await sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: '正在审校...' });

      translations = await reviewTranslations(translations, provider);
      task.translations = translations;
      await updateTask(hash, task);
      await sendToTab(tabId, MSG.REVIEW_UPDATE, { translations });

      // Polish step
      task.status = 'polishing';
      task.currentStep = 'polish';
      await updateTask(hash, task);
      await sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: '正在润色...' });

      translations = await polishTranslations(translations, provider);
      task.translations = translations;
    }

    task.status = 'completed';
    await updateTask(hash, task);
  }

  // Save to cache
  await saveTranslationCache(task.url, translations, mode, config.id);

  await sendToTab(tabId, MSG.TRANSLATION_COMPLETE, { translations });
  await sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: '完成' });
  setTimeout(() => sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: 'hide' }), 2000);

  setBadge('完成');
  setTimeout(clearBadge, 5000);
  stopKeepalive();
}

function splitIntoBatches(paragraphs: ParagraphTranslation[]): ParagraphTranslation[][] {
  const BATCH_WORD_LIMIT = 4000;
  const batches: ParagraphTranslation[][] = [];
  let currentBatch: ParagraphTranslation[] = [];
  let currentWordCount = 0;

  for (const p of paragraphs) {
    const wordCount = p.originalText.split(/\s+/).length;
    if (currentWordCount + wordCount > BATCH_WORD_LIMIT && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentWordCount = 0;
    }
    currentBatch.push(p);
    currentWordCount += wordCount;
  }

  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches.length > 0 ? batches : [paragraphs];
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
