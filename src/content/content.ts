import { type WorkerOutbound } from '../shared/messages';
import { extractContent } from './extractor';
import { injectTranslations, showFloatingIndicator, hideFloatingIndicator, showErrorBanner, removeAllTranslations } from './injector';

chrome.runtime.sendMessage({ type: 'CONTENT_READY', url: window.location.href });

const port = chrome.runtime.connect({ name: 'keepalive' });

function handleMessage(message: WorkerOutbound) {
  switch (message.type) {
    case 'INJECT_TRANSLATION':
      injectTranslations(message.translations);
      break;
    case 'SHOW_FLOATING_INDICATOR':
      if (message.step === 'hide') {
        hideFloatingIndicator();
      } else {
        showFloatingIndicator(message.step, message.progress);
      }
      break;
    case 'CLEAR_TRANSLATIONS':
      hideFloatingIndicator();
      removeAllTranslations();
      break;
    case 'TRANSLATION_COMPLETE':
      hideFloatingIndicator();
      injectTranslations(message.translations);
      break;
    case 'TRANSLATION_ERROR':
      hideFloatingIndicator();
      showErrorBanner(message.message);
      break;
  }
}

port.onMessage.addListener((message: WorkerOutbound) => {
  handleMessage(message);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const result = extractContent();
    sendResponse(result);
    return true;
  }
  // Handle translation messages sent via chrome.tabs.sendMessage
  handleMessage(message as WorkerOutbound);
});