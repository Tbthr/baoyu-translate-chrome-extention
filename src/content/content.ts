import { MSG } from '../shared/messages';
import { extractContent } from './extractor';
import { injectTranslations, showFloatingIndicator, hideFloatingIndicator, showErrorBanner, removeAllTranslations } from './injector';

chrome.runtime.sendMessage({ type: MSG.CONTENT_READY, payload: { url: window.location.href } });

const port = chrome.runtime.connect({ name: 'keepalive' });

function handleMessage(type: string, payload: any) {
  switch (type) {
    case MSG.INJECT_TRANSLATION:
      injectTranslations(payload.translations);
      break;
    case MSG.SHOW_FLOATING_INDICATOR:
      if (payload.step === 'hide') {
        hideFloatingIndicator();
      } else {
        showFloatingIndicator(payload.step, payload.progress);
      }
      break;
    case MSG.CLEAR_TRANSLATIONS:
      removeAllTranslations();
      break;
    case MSG.TRANSLATION_COMPLETE:
      hideFloatingIndicator();
      injectTranslations(payload.translations);
      break;
    case MSG.TRANSLATION_ERROR:
      hideFloatingIndicator();
      showErrorBanner(payload.message);
      break;
  }
}

port.onMessage.addListener((message) => {
  handleMessage(message.type, message.payload);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const result = extractContent();
    sendResponse(result);
    return true;
  }
  // Handle translation messages sent via chrome.tabs.sendMessage
  handleMessage(message.type, message.payload);
});
