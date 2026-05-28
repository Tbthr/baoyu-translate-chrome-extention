import type { ParagraphTranslation } from '../shared/types';
import Defuddle from 'defuddle';

interface ExtractedParagraph {
  index: number;
  selector: string;
  text: string;
  isCodeBlock: boolean;
  element: HTMLElement | null;
}

export function extractContent(): { paragraphs: ParagraphTranslation[]; fullText: string } | null {
  let result: ReturnType<Defuddle['parse']>;
  try {
    result = new Defuddle(document).parse();
  } catch {
    return null;
  }

  if (!result?.content || result.content.trim().length < 100) return null;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = result.content;

  const contentElements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
  if (contentElements.length === 0) return null;

  const extractedParagraphs: ExtractedParagraph[] = [];
  let index = 0;

  for (const el of contentElements) {
    const text = (el as HTMLElement).textContent?.trim() ?? '';
    if (!text) continue;

    const isCodeBlock = !!el.closest('pre') || !!el.closest('code');
    const liveElement = findLiveElement(text);
    const selector = liveElement ? generateSelector(liveElement) : '';

    extractedParagraphs.push({ index, selector, text, isCodeBlock, element: liveElement });
    index++;
  }

  if (extractedParagraphs.length === 0) return null;

  const fullText = extractedParagraphs
    .filter((p) => !p.isCodeBlock)
    .map((p) => p.text)
    .join('\n\n');

  const paragraphs: ParagraphTranslation[] = extractedParagraphs.map((p) => ({
    index: p.index,
    originalSelector: p.selector,
    originalText: p.text,
    translatedText: '',
    isCodeBlock: p.isCodeBlock,
    batchIndex: 0,
  }));

  return { paragraphs, fullText };
}

function findLiveElement(text: string): HTMLElement | null {
  const selectors = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, font';
  const candidates = document.querySelectorAll(selectors);

  for (const el of candidates) {
    if (el.textContent?.trim() === text) return el as HTMLElement;
  }

  if (text.length > 40) {
    const prefix = text.substring(0, 40);
    for (const el of candidates) {
      const elText = el.textContent?.trim() ?? '';
      if (elText.length > 40 && elText.substring(0, 40) === prefix) return el as HTMLElement;
    }
  }

  return null;
}

function generateSelector(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const path: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${idx})`;
      }
    }
    path.unshift(selector);
    current = parent;
  }
  return path.join(' > ');
}
