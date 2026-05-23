import type { ParagraphTranslation } from '../shared/types';
import { Readability } from '@mozilla/readability';

interface ExtractedParagraph {
  index: number;
  selector: string;
  text: string;
  isCodeBlock: boolean;
  element: HTMLElement;
}

let extractedParagraphs: ExtractedParagraph[] = [];

export function getExtractedParagraphs(): ExtractedParagraph[] {
  return extractedParagraphs;
}

export function extractContent(): { paragraphs: ParagraphTranslation[]; fullText: string } | null {
  const clonedDoc = document.cloneNode(true) as Document;
  const reader = new Readability(clonedDoc);
  const article = reader.parse();

  if (!article || !article.textContent || article.textContent.trim().length < 100) {
    return null;
  }

  const selectorStr = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td';
  const elements = document.querySelectorAll(selectorStr);
  extractedParagraphs = [];

  const nonArticleContent = !article.title && !article.content;
  if (nonArticleContent) return null;

  let index = 0;
  elements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (!isInArticleBody(htmlEl)) return;

    const text = htmlEl.textContent?.trim() ?? '';
    if (text.length === 0) return;

    const isCodeBlock =
      htmlEl.tagName === 'PRE' ||
      htmlEl.tagName === 'CODE' ||
      !!htmlEl.closest('pre') ||
      !!htmlEl.closest('code');

    const selector = generateSelector(htmlEl);
    extractedParagraphs.push({ index, selector, text, isCodeBlock, element: htmlEl });
    index++;
  });

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

function isInArticleBody(el: HTMLElement): boolean {
  const skipSelectors = ['nav', 'header', 'footer', 'aside', '.sidebar', '.navigation', '.menu', '.ad', '.advertisement', '.comment', '#comments'];
  for (const sel of skipSelectors) {
    if (el.closest(sel)) return false;
  }
  return true;
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

export function getElementBySelector(selector: string): HTMLElement | null {
  return document.querySelector(selector);
}
