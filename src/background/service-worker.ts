import { MSG, type WorkerInbound } from '../shared/messages';
import { getProviderConfig } from '../shared/storage';
import type { TranslationMode, ParagraphTranslation } from '../shared/types';
import { start, cancel, retry, getStatus, recoverCrashedTasks, type TaskCallbacks } from './task-orchestrator';

function makeTranslationCallbacks(tabId: number): TaskCallbacks {
  return {
    onProgress: (step, batch) => {
      if (batch) {
        sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, {
          step: '正在翻译',
          progress: `${batch.current}/${batch.total} 批`,
        });
      } else {
        sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step });
      }
    },
    onComplete: async (translations) => {
      await sendToTab(tabId, MSG.TRANSLATION_COMPLETE, { translations });
      await sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: '完成' });
      setTimeout(() => sendToTab(tabId, MSG.SHOW_FLOATING_INDICATOR, { step: 'hide' }), 2000);
      setBadge('完成');
      setTimeout(clearBadge, 5000);
      stopKeepalive();
    },
    onError: async ({ message }) => {
      await sendToTab(tabId, MSG.TRANSLATION_ERROR, { message });
      clearBadge();
      stopKeepalive();
    },
  };
}

// ── MV3 infrastructure: keepalive ──────────────────────────────────────────────

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

// ── Recovery on startup ─────────────────────────────────────────────────────────

recoverCrashedTasks();

// ── MV3 infrastructure: badge ─────────────────────────────────────────────────

function setBadge(text: string): void {
  chrome.action.setBadgeText({ text: text.slice(0, 4) });
  chrome.action.setBadgeBackgroundColor({ color: '#1a1a1a' });
}

function clearBadge(): void {
  chrome.action.setBadgeText({ text: '' });
}

// ── Tab communication (Platform API) ──────────────────────────────────────────

async function extractContent(tabId: number): Promise<{ paragraphs: unknown[]; fullText: string } | null> {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
  } catch {
    return null;
  }
}

export async function sendToTab(tabId: number, type: string, payload: unknown, controller?: AbortController | null): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type, payload });
  } catch {
    controller?.abort();
  }
}

// ── Message routing (Service Worker → thin adapter) ────────────────────────────

chrome.runtime.onMessage.addListener((message: WorkerInbound, _sender, sendResponse) => {
  switch (message.type) {
    case MSG.GET_PROVIDER_CONFIG:
      getProviderConfig().then(sendResponse);
      return true;

    case MSG.GET_PROVIDER_CONFIG_BY_ID:
      return false;

    case MSG.SAVE_PROVIDER_CONFIG:
      return false;

    case MSG.GET_LAST_MODE:
      return false;

    case MSG.SAVE_LAST_MODE:
      return false;

    case MSG.START_TRANSLATION:
      handleStartTranslation(message.mode).then(sendResponse);
      return true;

    case MSG.GET_TASK_STATUS:
      handleGetTaskStatus(message.url).then(sendResponse);
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

// ── Handlers (orchestrator delegation + platform callbacks) ─────────────────────

async function handleStartTranslation(mode: TranslationMode): Promise<unknown> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { error: 'No active tab' };
  const tabId = tab.id;

  const url = tab.url;
  if (!url) return { error: 'No URL' };

  const config = await getProviderConfig();
  if (!config?.apiKey) return { error: '请先配置 API Key' };

  const extraction = await extractContent(tabId);
  if (!extraction || !extraction.paragraphs.length) {
    return { error: '无法识别页面正文内容' };
  }

  startKeepalive();
  setBadge('翻译中');

  await start(mode, url, config, {
    paragraphs: extraction.paragraphs as ParagraphTranslation[],
    fullText: extraction.fullText,
  }, makeTranslationCallbacks(tabId));

  return { ok: true };
}

async function handleGetTaskStatus(url: string): Promise<unknown> {
  if (!url) return null;
  return getStatus(url);
}

async function handleCancelTranslation(): Promise<unknown> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;

  // Cancel via orchestrator
  await cancel();

  // Clear tab state
  if (tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: MSG.CLEAR_TRANSLATIONS, payload: {} });
    } catch {
      // Tab may have been closed
    }
  }

  stopKeepalive();
  clearBadge();
  return { ok: true };
}

async function handleRetryTranslation(): Promise<unknown> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { error: 'No active tab' };
  const tabId = tab.id;

  const url = tab.url;
  if (!url) return { error: 'No URL' };

  const config = await getProviderConfig();
  if (!config?.apiKey) return { error: '请先配置 API Key' };

  // Clear existing translations
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.CLEAR_TRANSLATIONS, payload: {} });
  } catch {
    // Tab may have been closed
  }

  startKeepalive();
  setBadge('翻译中');

  await retry(url, config, makeTranslationCallbacks(tabId));

  return { ok: true };
}