import { MSG } from '../shared/messages';
import { extractContent } from './extractor';
import { injectTranslations, updateTranslations, showFloatingIndicator, hideFloatingIndicator, showErrorBanner } from './injector';

chrome.runtime.sendMessage({ type: MSG.CONTENT_READY, payload: { url: window.location.href } });

const port = chrome.runtime.connect({ name: 'keepalive' });

port.onMessage.addListener((message) => {
  const { type, payload } = message;

  switch (type) {
    case MSG.INJECT_TRANSLATION:
      injectTranslations(payload.translations, payload.isDraft);
      break;
    case MSG.REVIEW_UPDATE:
      updateTranslations(payload.translations);
      break;
    case MSG.SHOW_FLOATING_INDICATOR:
      if (payload.step === 'hide') {
        hideFloatingIndicator();
      } else {
        showFloatingIndicator(payload.step, payload.progress);
      }
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
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const result = extractContent();
    sendResponse(result);
    return true;
  }
});
