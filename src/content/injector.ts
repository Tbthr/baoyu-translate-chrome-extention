import type { ParagraphTranslation } from '../shared/types';

const TRANSLATION_CLASS = 'baoyu-translation';
const CONTAINER_CLASS = 'baoyu-translation-container';

function getElementBySelector(selector: string): HTMLElement | null {
  if (!selector) return null;
  return document.querySelector(selector);
}

function findElementByText(text: string): HTMLElement | null {
  const candidates = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
  const trimmed = text.trim();

  for (const el of candidates) {
    if (el.textContent?.trim() === trimmed) return el as HTMLElement;
  }

  if (trimmed.length > 40) {
    const prefix = trimmed.substring(0, 40);
    for (const el of candidates) {
      const elText = el.textContent?.trim() ?? '';
      if (elText.length > 40 && elText.substring(0, 40) === prefix) return el as HTMLElement;
    }
  }

  return null;
}

function findOriginalElement(t: ParagraphTranslation): HTMLElement | null {
  const bySelector = getElementBySelector(t.originalSelector);
  if (bySelector) return bySelector;
  return findElementByText(t.originalText);
}

export function injectTranslations(translations: ParagraphTranslation[]): void {
  for (const t of translations) {
    if (t.isCodeBlock) continue;
    if (!t.translatedText) continue;

    const original = findOriginalElement(t);
    if (!original) continue;

    removeExistingTranslation(original);

    const container = document.createElement('div');
    container.className = CONTAINER_CLASS;
    container.style.overflow = 'hidden';
    container.style.marginTop = '-8px';
    container.style.marginBottom = '32px';

    const translationEl = document.createElement('div');
    translationEl.className = TRANSLATION_CLASS;
    translationEl.textContent = t.translatedText;
    translationEl.style.cssText = [
      'margin-top: 4px',
      'padding: 4px 0 4px 12px',
      'border-left: 3px solid #ccc',
      'color: #333',
      'line-height: 1.7',
      'font-size: 0.95em',
      'opacity: 1',
      'transition: opacity 0.3s ease',
    ].join(';');

    inheritTextStyles(original, translationEl);

    container.appendChild(translationEl);
    original.insertAdjacentElement('afterend', container);
  }
}

function removeExistingTranslation(original: HTMLElement): void {
  const next = original.nextElementSibling;
  if (next && next.classList.contains(CONTAINER_CLASS)) {
    next.remove();
  }
}

function inheritTextStyles(source: HTMLElement, target: HTMLElement): void {
  const computed = window.getComputedStyle(source);
  const props = ['fontSize', 'fontFamily', 'fontWeight', 'color', 'lineHeight', 'textAlign'] as const;
  for (const prop of props) {
    target.style[prop] = computed[prop];
  }
}

export function removeAllTranslations(): void {
  document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach((el) => el.remove());
}

let floatingIndicator: HTMLElement | null = null;

export function showFloatingIndicator(step: string, progress?: string): void {
  if (!floatingIndicator) {
    floatingIndicator = document.createElement('div');
    floatingIndicator.style.cssText = [
      'position: fixed',
      'bottom: 20px',
      'right: 20px',
      'background: #1a1a1a',
      'color: #fff',
      'padding: 10px 16px',
      'border-radius: 8px',
      'font-size: 13px',
      'z-index: 2147483647',
      'box-shadow: 0 4px 12px rgba(0,0,0,0.15)',
      'font-family: -apple-system, BlinkMacSystemFont, sans-serif',
      'display: flex',
      'align-items: center',
      'gap: 8px',
    ].join(';');

    const dot = document.createElement('span');
    dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#4ade80;';
    floatingIndicator.appendChild(dot);

    const text = document.createElement('span');
    text.id = 'baoyu-indicator-text';
    floatingIndicator.appendChild(text);

    document.body.appendChild(floatingIndicator);
  }

  const textEl = floatingIndicator.querySelector('#baoyu-indicator-text')!;
  textEl.textContent = progress ? `${step} ${progress}` : step;
}

export function hideFloatingIndicator(): void {
  if (floatingIndicator) {
    floatingIndicator.remove();
    floatingIndicator = null;
  }
}

export function showErrorBanner(message: string): void {
  removeErrorBanner();

  const banner = document.createElement('div');
  banner.id = 'baoyu-error-banner';
  banner.style.cssText = [
    'position: fixed',
    'top: 20px',
    'left: 50%',
    'transform: translateX(-50%)',
    'background: #fff',
    'border: 1px solid #e5e5e5',
    'border-radius: 12px',
    'padding: 16px 20px',
    'box-shadow: 0 4px 20px rgba(0,0,0,0.1)',
    'z-index: 2147483647',
    'font-family: -apple-system, BlinkMacSystemFont, sans-serif',
    'max-width: 400px',
    'width: 90%',
  ].join(';');

  const msg = document.createElement('p');
  msg.style.cssText = 'font-size: 14px; color: #333; margin: 0 0 12px;';
  msg.textContent = message;
  banner.appendChild(msg);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

  const retryBtn = createActionButton('重试', () => {
    chrome.runtime.sendMessage({ type: 'RETRY_TRANSLATION' });
    removeErrorBanner();
  });
  const cancelBtn = createActionButton('取消', () => {
    chrome.runtime.sendMessage({ type: 'CANCEL_TRANSLATION' });
    removeErrorBanner();
  });

  actions.appendChild(retryBtn);
  actions.appendChild(cancelBtn);
  banner.appendChild(actions);
  document.body.appendChild(banner);
}

function createActionButton(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = [
    'padding: 6px 14px',
    'border-radius: 6px',
    'border: 1px solid #e5e5e5',
    'background: #fff',
    'font-size: 13px',
    'cursor: pointer',
    'font-family: inherit',
  ].join(';');
  btn.addEventListener('click', onClick);
  btn.addEventListener('mouseenter', () => (btn.style.background = '#f5f5f5'));
  btn.addEventListener('mouseleave', () => (btn.style.background = '#fff'));
  return btn;
}

function removeErrorBanner(): void {
  document.getElementById('baoyu-error-banner')?.remove();
}
