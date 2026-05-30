import { describe, it, expect, beforeEach } from 'vitest';

function createStorageMock() {
  const store = new Map<string, unknown>();
  return {
    get: (keys: string | string[] | null) => {
      if (keys === null) {
        const result: Record<string, unknown> = {};
        for (const [k, v] of store) result[k] = v;
        return Promise.resolve(result);
      }
      const keyList = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const k of keyList) {
        if (store.has(k)) result[k] = store.get(k);
      }
      return Promise.resolve(result);
    },
    set: (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
      return Promise.resolve();
    },
    remove: (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) store.delete(k);
      return Promise.resolve();
    },
    get inner() { return store; },
  };
}

const mockChrome = {
  storage: {
    sync: createStorageMock(),
    local: createStorageMock(),
  },
};

vi.stubGlobal('chrome', mockChrome);

import { getTask, saveTask, removeTask, getCachedTranslation, saveCachedTranslation } from './storage';
import { CACHE_TTL_MS, CACHE_MAX_ENTRIES } from './constants';
import type { TranslationTask } from './types';

function makeTask(overrides: Partial<TranslationTask> = {}): TranslationTask {
  return {
    id: 'test-id',
    url: 'https://example.com/article',
    mode: 'normal',
    status: 'pending',
    translations: [],
    createdAt: 1000000,
    updatedAt: 1000000,
    ...overrides,
  };
}

describe('Storage — task lifecycle', () => {
  beforeEach(() => {
    mockChrome.storage.local.inner.clear();
    mockChrome.storage.sync.inner.clear();
  });

  it('saveTask → getTask round-trip returns typed task', async () => {
    const url = 'https://example.com/article';
    const task = makeTask();

    await saveTask(url, task);
    const result = await getTask(url);

    expect(result).toEqual(task);
  });

  it('getTask returns null when storage is empty', async () => {
    const result = await getTask('https://example.com/nothing');
    expect(result).toBeNull();
  });

  it('getTask returns null for corrupted data', async () => {
    const url = 'https://example.com/corrupted';
    mockChrome.storage.local.inner.set(`task_${url}`, { garbage: true, missing: 'fields' });

    const result = await getTask(url);
    expect(result).toBeNull();
  });

  it('removeTask clears the task', async () => {
    const url = 'https://example.com/article';
    await saveTask(url, makeTask());

    await removeTask(url);
    const result = await getTask(url);

    expect(result).toBeNull();
  });
});

describe('Storage — cache lifecycle', () => {
  beforeEach(() => {
    mockChrome.storage.local.inner.clear();
  });

  it('getCachedTranslation returns null when cache is expired', async () => {
    const url = 'https://example.com/expired';
    await saveCachedTranslation(url, [{
      index: 0, originalText: 'Hello', translatedText: '你好', isCodeBlock: false, batchIndex: 0, elementId: 'test-id',
    }], 'normal', 'openai');

    // Corrupt the timestamp to make it expired
    const store = mockChrome.storage.local.inner;
    for (const [key, val] of store) {
      if (key.startsWith('cache_')) {
        store.set(key, { ...(val as object), timestamp: Date.now() - CACHE_TTL_MS - 1000 });
      }
    }

    const result = await getCachedTranslation(url);
    expect(result).toBeNull();
  });

  it('saveCachedTranslation evicts oldest entry when at capacity', async () => {
    // Fill cache to max capacity
    for (let i = 0; i < CACHE_MAX_ENTRIES; i++) {
      await saveCachedTranslation(
        `https://example.com/page-${i}`,
        [{ index: 0, originalText: `text ${i}`, translatedText: `翻译 ${i}`, isCodeBlock: false, batchIndex: 0, elementId: `id-${i}` }],
        'normal',
        'openai',
      );
    }

    // First page should still be cached
    expect(await getCachedTranslation('https://example.com/page-0')).not.toBeNull();

    // Add one more — should evict the oldest (page-0)
    await saveCachedTranslation(
      'https://example.com/page-overflow',
      [{ index: 0, originalText: 'overflow', translatedText: '溢出', isCodeBlock: false, batchIndex: 0, elementId: 'overflow-id' }],
      'normal',
      'openai',
    );

    // page-0 should be evicted
    expect(await getCachedTranslation('https://example.com/page-0')).toBeNull();
    // page-1 and the new entry should still exist
    expect(await getCachedTranslation('https://example.com/page-1')).not.toBeNull();
    expect(await getCachedTranslation('https://example.com/page-overflow')).not.toBeNull();
  });

  it('saveCachedTranslation → getCachedTranslation round-trip', async () => {
    const url = 'https://example.com/round-trip';
    const translations = [
      { index: 0, originalText: 'Hello', translatedText: '你好', isCodeBlock: false, batchIndex: 0, elementId: 'el-1' },
      { index: 1, originalText: 'World', translatedText: '世界', isCodeBlock: false, batchIndex: 0, elementId: 'el-2' },
    ];

    await saveCachedTranslation(url, translations, 'refined', 'deepseek');
    const result = await getCachedTranslation(url);

    expect(result).not.toBeNull();
    expect(result!.url).toBe(url);
    expect(result!.mode).toBe('refined');
    expect(result!.providerId).toBe('deepseek');
    expect(result!.translations).toEqual(translations);
    expect(result!.timestamp).toBeGreaterThan(Date.now() - 5000);
  });
});
