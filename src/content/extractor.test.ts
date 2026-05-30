import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractContent } from './extractor';
import { cleanupAllTags, findTaggedElement } from './element-tagging';

describe('extractor', () => {
  beforeEach(() => {
    cleanupAllTags();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanupAllTags();
    document.body.innerHTML = '';
  });

  it('extracts paragraphs with elementId instead of originalSelector', () => {
    document.body.innerHTML = '<p>This is a substantial paragraph that contains enough text for Defuddle to parse and extract properly from the document.</p>';
    const result = extractContent();
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.paragraphs.length).toBeGreaterThan(0);
    const para = result.paragraphs[0];
    expect(para.elementId).toBeDefined();
    expect(para.elementId.length).toBeGreaterThan(0);
  });

  it('tagged elements have data-baoyu-id attribute', () => {
    document.body.innerHTML = '<p>Test paragraph one with enough content to be extracted properly by the Defuddle parser from the document body.</p>';
    const result = extractContent();
    expect(result).not.toBeNull();
    if (!result) return;

    const para = result.paragraphs[0];
    const found = findTaggedElement(para.elementId);
    expect(found).not.toBeNull();
    expect(found?.textContent?.trim()).toBe('Test paragraph one with enough content to be extracted properly by the Defuddle parser from the document body.');
  });

  it('extractContent twice cleans up old tags before creating new ones', () => {
    document.body.innerHTML = '<p>First extraction with sufficient content to be parsed and extracted successfully by the Defuddle library from the document.</p>';
    const first = extractContent();
    expect(first).not.toBeNull();
    if (!first) return;

    const firstId = first.paragraphs[0].elementId;

    document.body.innerHTML = '<p>Second extraction with sufficient content to be parsed and extracted successfully by the Defuddle library from the document.</p>';
    const second = extractContent();
    expect(second).not.toBeNull();
    if (!second) return;

    expect(findTaggedElement(firstId)).toBeNull();

    const secondFound = findTaggedElement(second.paragraphs[0].elementId);
    expect(secondFound?.textContent?.trim()).toBe('Second extraction with sufficient content to be parsed and extracted successfully by the Defuddle library from the document.');
  });

  it('does not include originalSelector field', () => {
    document.body.innerHTML = '<p>No selector field should exist in the paragraph translation object that is returned by the extractContent function for the document.</p>';
    const result = extractContent();
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.paragraphs[0]).not.toHaveProperty('originalSelector');
  });
});