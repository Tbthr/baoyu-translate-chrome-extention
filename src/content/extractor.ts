import type { ParagraphTranslation } from '../shared/types';
import { tagElement, cleanupAllTags } from './element-tagging';
import Defuddle from 'defuddle';

interface ExtractedParagraph {
  index: number;
  text: string;
  isCodeBlock: boolean;
  element: HTMLElement | null;
}

export function extractContent(): { paragraphs: ParagraphTranslation[]; fullText: string } | null {
  cleanupAllTags();

  let result: ReturnType<Defuddle['parse']>;
  try {
    result = new Defuddle(document).parse();
  } catch {
    return null;
  }

  if (!result?.content || result.content.trim().length < 100) return null;

  const defuddleResult = extractWithDefuddle(result.content);

  // If Defuddle extraction yields too few matched elements, try fallback extraction
  const fallbackResult = extractFromTextNodes();
  const matchedDefuddle = defuddleResult.filter((p) => p.element).length;
  const matchedFallback = fallbackResult.filter((p) => p.element).length;

  const extractedParagraphs = matchedFallback > matchedDefuddle * 2 ? fallbackResult : defuddleResult;

  if (extractedParagraphs.length === 0) return null;

  const fullText = extractedParagraphs
    .filter((p) => !p.isCodeBlock)
    .map((p) => p.text)
    .join('\n\n');

  const paragraphs: ParagraphTranslation[] = extractedParagraphs.map((p) => ({
    index: p.index,
    originalText: p.text,
    translatedText: '',
    isCodeBlock: p.isCodeBlock,
    batchIndex: 0,
    elementId: p.element ? tagElement(p.element) : '',
  }));

  return { paragraphs, fullText };
}

/**
 * Extract paragraphs using Defuddle's parsed content.
 */
function extractWithDefuddle(html: string): ExtractedParagraph[] {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const contentElements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
  const paragraphs: ExtractedParagraph[] = [];
  let index = 0;

  for (const el of contentElements) {
    const text = (el as HTMLElement).textContent?.trim() ?? '';
    if (!text) continue;

    const isCodeBlock = !!el.closest('pre') || !!el.closest('code');
    const liveElement = findLiveElement(text);

    paragraphs.push({ index, text, isCodeBlock, element: liveElement });
    index++;
  }

  return paragraphs;
}

/**
 * Fallback: extract paragraphs directly from DOM text nodes.
 * Groups consecutive text nodes (separated by <br>) into paragraphs,
 * skipping very short nodes like footnote markers.
 */
function extractFromTextNodes(): ExtractedParagraph[] {
  const paragraphs: ExtractedParagraph[] = [];
  let index = 0;
  const seen = new Set<string>();

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    const text = (textNode.textContent ?? '').replace(/\s+/g, ' ').trim();

    // Skip short text (footnotes, labels) and duplicates
    if (text.length < 40) continue;
    if (seen.has(text)) continue;

    // Skip text that looks like already-injected translations
    if (textNode.parentElement?.classList.contains('baoyu-translation')) continue;
    if (textNode.parentElement?.classList.contains('baoyu-translation-container')) continue;
    if (textNode.parentElement?.classList.contains('baoyu-text-wrapper')) continue;

    seen.add(text);

    // Wrap the text node in a <span> so we can reference it later
    const wrapped = wrapTextNode(textNode);
    paragraphs.push({ index, text, isCodeBlock: false, element: wrapped });
    index++;
  }

  return paragraphs;
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

  // Fallback: search text nodes and wrap them in <span>
  return findTextNodeAndWrap(text);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function findTextNodeAndWrap(text: string): HTMLElement | null {
  const normalizedTarget = normalizeWhitespace(text);
  if (normalizedTarget.length < 20) return null;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    const nodeText = textNode.textContent ?? '';
    const normalized = normalizeWhitespace(nodeText);
    if (normalized.length < 20) continue;

    if (normalized === normalizedTarget || (normalizedTarget.length > 40 && normalized.startsWith(normalizedTarget))) {
      return wrapTextNode(textNode);
    }
  }

  return null;
}

function wrapTextNode(textNode: Text): HTMLElement {
  const span = document.createElement('span');
  span.className = 'baoyu-text-wrapper';
  textNode.parentNode?.insertBefore(span, textNode);
  span.appendChild(textNode);
  return span;
}
