import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tagElement, findTaggedElement, cleanupAllTags } from './element-tagging';

describe('element-tagging', () => {
  beforeEach(() => {
    cleanupAllTags();
  });

  afterEach(() => {
    cleanupAllTags();
  });

  it('tagged element can be found via findTaggedElement', () => {
    const el = document.createElement('div');
    el.textContent = 'Hello';
    document.body.appendChild(el);

    const id = tagElement(el);
    const found = findTaggedElement(id);

    expect(found).toBe(el);
  });

  it('findTaggedElement returns null for non-existent ID', () => {
    const found = findTaggedElement('does-not-exist');
    expect(found).toBeNull();
  });

  it('cleanupAllTags removes all tags', () => {
    const el1 = document.createElement('p');
    const el2 = document.createElement('p');
    document.body.appendChild(el1);
    document.body.appendChild(el2);

    tagElement(el1);
    tagElement(el2);

    cleanupAllTags();

    expect(findTaggedElement(el1.getAttribute('data-baoyu-id')!)).toBeNull();
    expect(findTaggedElement(el2.getAttribute('data-baoyu-id')!)).toBeNull();
    expect(document.querySelector('[data-baoyu-id]')).toBeNull();
  });

  it('multiple elements get distinct IDs', () => {
    const el1 = document.createElement('div');
    const el2 = document.createElement('div');
    document.body.appendChild(el1);
    document.body.appendChild(el2);

    const id1 = tagElement(el1);
    const id2 = tagElement(el2);

    expect(id1).not.toBe(id2);
  });

  it('re-tagging an element replaces the old ID', () => {
    const el = document.createElement('span');
    document.body.appendChild(el);

    const id1 = tagElement(el);
    const id2 = tagElement(el);

    expect(id1).not.toBe(id2);
    expect(el.getAttribute('data-baoyu-id')).toBe(id2);
    expect(findTaggedElement(id1)).toBeNull();
    expect(findTaggedElement(id2)).toBe(el);
  });
});
