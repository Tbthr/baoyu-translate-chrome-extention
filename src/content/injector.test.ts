import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { injectTranslations, removeAllTranslations } from './injector';
import { cleanupAllTags, tagElement, findTaggedElement } from './element-tagging';
import type { ParagraphTranslation } from '../shared/types';

describe('injector', () => {
  beforeEach(() => {
    cleanupAllTags();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    removeAllTranslations();
    document.body.innerHTML = '';
  });

  it('injects translation next to the tagged element', () => {
    const p = document.createElement('p');
    p.textContent = 'Original text for injection';
    document.body.appendChild(p);
    const id = tagElement(p);

    const translations: ParagraphTranslation[] = [
      {
        index: 0,
        originalText: 'Original text for injection',
        translatedText: 'Translated text',
        isCodeBlock: false,
        batchIndex: 0,
        elementId: id,
      },
    ];

    injectTranslations(translations);

    const container = document.querySelector('.baoyu-translation-container');
    expect(container).not.toBeNull();
    const translation = container?.querySelector('.baoyu-translation');
    expect(translation?.textContent).toBe('Translated text');
  });

  it('skips paragraph with missing elementId without error', () => {
    const p = document.createElement('p');
    p.textContent = 'Original text';
    document.body.appendChild(p);

    const translations: ParagraphTranslation[] = [
      {
        index: 0,
        originalText: 'Original text',
        translatedText: 'Translated text',
        isCodeBlock: false,
        batchIndex: 0,
        elementId: '',
      },
    ];

    expect(() => injectTranslations(translations)).not.toThrow();
    const container = document.querySelector('.baoyu-translation-container');
    expect(container).toBeNull();
  });

  it('skips paragraph with elementId not found in DOM without error', () => {
    const translations: ParagraphTranslation[] = [
      {
        index: 0,
        originalText: 'Original text',
        translatedText: 'Translated text',
        isCodeBlock: false,
        batchIndex: 0,
        elementId: 'non-existent-id',
      },
    ];

    expect(() => injectTranslations(translations)).not.toThrow();
    const container = document.querySelector('.baoyu-translation-container');
    expect(container).toBeNull();
  });

  it('removeAllTranslations calls cleanupAllTags', () => {
    const p = document.createElement('p');
    document.body.appendChild(p);
    const id = tagElement(p);

    expect(findTaggedElement(id)).not.toBeNull();

    removeAllTranslations();

    expect(findTaggedElement(id)).toBeNull();
  });

  it('does not include originalSelector in translations', () => {
    const p = document.createElement('p');
    p.textContent = 'Test paragraph';
    document.body.appendChild(p);
    tagElement(p);

    const translations: ParagraphTranslation[] = [
      {
        index: 0,
        originalText: 'Test paragraph',
        translatedText: 'Test translation',
        isCodeBlock: false,
        batchIndex: 0,
        elementId: 'test-id',
      },
    ];

    expect(translations[0]).not.toHaveProperty('originalSelector');
  });
});