import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TranslationTask, ParagraphTranslation, TranslationMode } from '../shared/types';

// Mock the ai-adapter module
vi.mock('./ai-adapter', () => ({
  chat: vi.fn(),
}));

// Mock chrome.storage
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

// ── Mock storage module with vi.hoisted ──────────────────────────────────────

const { getTaskMock, saveTaskMock, removeTaskMock, getCachedTranslationMock, saveCachedTranslationMock, getAllTasksMock } = vi.hoisted(() => {
  return {
    getTaskMock: vi.fn().mockResolvedValue(null),
    saveTaskMock: vi.fn().mockResolvedValue(undefined),
    removeTaskMock: vi.fn().mockResolvedValue(undefined),
    getCachedTranslationMock: vi.fn().mockResolvedValue(null),
    saveCachedTranslationMock: vi.fn().mockResolvedValue(undefined),
    getAllTasksMock: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../shared/storage', () => ({
  getTask: getTaskMock,
  saveTask: saveTaskMock,
  removeTask: removeTaskMock,
  getCachedTranslation: getCachedTranslationMock,
  saveCachedTranslation: saveCachedTranslationMock,
  getAllTasks: getAllTasksMock,
  getProviderConfig: vi.fn().mockResolvedValue({ apiKey: 'test' }),
  getProviderConfigById: vi.fn().mockResolvedValue(null),
  saveProviderConfig: vi.fn().mockResolvedValue(undefined),
  getLastMode: vi.fn().mockResolvedValue('normal'),
  saveLastMode: vi.fn().mockResolvedValue(undefined),
  getMoreSettingsOpen: vi.fn().mockResolvedValue(false),
  saveMoreSettingsOpen: vi.fn().mockResolvedValue(undefined),
}));

import { chat } from './ai-adapter';
const mockChat = chat as ReturnType<typeof vi.fn>;

import { start, cancel, retry, getStatus, recoverCrashedTasks } from './task-orchestrator';

function makeParagraph(text: string, index: number): ParagraphTranslation {
  return {
    index,
    originalSelector: '',
    originalText: text,
    translatedText: '',
    isCodeBlock: false,
    batchIndex: 0,
  };
}

function makeCallbacks() {
  return {
    onProgress: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
  };
}

describe('TaskOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockChrome.storage.local.inner.clear();
    mockChrome.storage.sync.inner.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('start', () => {
    it('creates task, checks cache, runs pipeline, saves cache on completion', async () => {
      const url = 'https://example.com/article';
      const mode: TranslationMode = 'quick';
      const config = { baseUrl: 'https://api.test.com', apiKey: 'test-key', model: 'test-model' };
      const extraction = {
        paragraphs: [makeParagraph('Hello', 0), makeParagraph('World', 1)],
        fullText: 'Hello\n\nWorld',
      };

      mockChat.mockResolvedValueOnce({
        content: '你好\n\n世界',
      });

      const callbacks = makeCallbacks();
      await start(mode, url, config, extraction, callbacks);

      // Wait for pipeline to complete and callbacks to fire
      await vi.waitFor(() => expect(callbacks.onComplete).toHaveBeenCalled());

      // Find the task save with 'completed' status
      const completedCall = saveTaskMock.mock.calls.find(
        (call) => (call[1] as TranslationTask).status === 'completed'
      );
      expect(completedCall).toBeDefined();

      const savedTask = completedCall![1] as TranslationTask;
      expect(savedTask.url).toBe(url);
      expect(savedTask.mode).toBe(mode);
      expect(savedTask.status).toBe('completed');
      expect(savedTask.translations[0].translatedText).toBe('你好');
    });

    it('returns cached translations immediately on cache hit', async () => {
      const cachedTranslations = [makeParagraph('你好', 0)];
      cachedTranslations[0].translatedText = '你好';

      getCachedTranslationMock.mockResolvedValueOnce({
        url: 'https://example.com/article',
        translations: cachedTranslations,
        mode: 'quick' as const,
        providerId: 'test-id',
        timestamp: Date.now(),
      });

      const url = 'https://example.com/article';
      const mode: TranslationMode = 'quick';
      const config = { baseUrl: 'https://api.test.com', apiKey: 'test-key', model: 'test-model' };
      const extraction = {
        paragraphs: [makeParagraph('Hello', 0)],
        fullText: 'Hello',
      };

      const callbacks = makeCallbacks();
      await start(mode, url, config, extraction, callbacks);

      expect(callbacks.onComplete).toHaveBeenCalledWith(cachedTranslations);
      expect(mockChat).not.toHaveBeenCalled();
    });

    it('calls onProgress during pipeline execution', async () => {
      mockChat.mockResolvedValueOnce({ content: '你好' });

      const url = 'https://example.com/article';
      const config = { baseUrl: 'https://api.test.com', apiKey: 'test-key', model: 'test-model' };
      const extraction = {
        paragraphs: [makeParagraph('Hello', 0)],
        fullText: 'Hello',
      };

      const callbacks = makeCallbacks();
      await start('quick', url, config, extraction, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onProgress).toHaveBeenCalled();
      });
    });

    it('calls onError on pipeline failure', async () => {
      mockChat.mockRejectedValueOnce(new Error('API Error'));

      const url = 'https://example.com/article';
      const config = { baseUrl: 'https://api.test.com', apiKey: 'test-key', model: 'test-model' };
      const extraction = {
        paragraphs: [makeParagraph('Hello', 0)],
        fullText: 'Hello',
      };

      const callbacks = makeCallbacks();
      await start('quick', url, config, extraction, callbacks);

      // Error handler is called asynchronously via catch()
      await vi.waitFor(
        () => { expect(callbacks.onError).toHaveBeenCalled(); },
        { timeout: 5000 }
      );

      // Verify onError was called with an error object containing a message
      expect(callbacks.onError.mock.calls[0][0]).toHaveProperty('message');

      const savedTask = saveTaskMock.mock.calls.find(
        (call) => (call[1] as TranslationTask).status === 'failed'
      );
      expect(savedTask).toBeDefined();
    });
  });

  describe('cancel', () => {
    it('removes task from storage', async () => {
      // First start a translation to set up active state
      mockChat.mockResolvedValueOnce({ content: '你好' });

      const url = 'https://example.com/article';
      await start('quick', url, { baseUrl: '', apiKey: '', model: '' }, {
        paragraphs: [makeParagraph('Hello', 0)],
        fullText: 'Hello',
      }, makeCallbacks());

      await vi.waitFor(() => {
        expect(saveTaskMock).toHaveBeenCalled();
      });

      await cancel(url);

      expect(removeTaskMock).toHaveBeenCalledWith(url);
    });
  });

  describe('retry', () => {
    it('loads existing task, re-runs pipeline without re-extracting', async () => {
      const existingTask: TranslationTask = {
        id: 'test-id',
        url: 'https://example.com/article',
        mode: 'quick',
        status: 'failed',
        translations: [makeParagraph('Hello', 0)],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      getTaskMock.mockResolvedValueOnce(existingTask);
      mockChat.mockResolvedValueOnce({ content: '你好' });

      const config = { baseUrl: 'https://api.test.com', apiKey: 'test-key', model: 'test-model' };
      const callbacks = makeCallbacks();
      await retry('https://example.com/article', config, callbacks);

      await vi.waitFor(() => {
        expect(callbacks.onComplete).toHaveBeenCalled();
      });

      expect(mockChat).toHaveBeenCalled();
    });
  });

  describe('recoverCrashedTasks', () => {
    it('marks in-progress tasks as paused', async () => {
      const pendingTask: TranslationTask = {
        id: 'test-id',
        url: 'https://example.com/article1',
        mode: 'normal',
        status: 'pending',
        translations: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const completedTask: TranslationTask = {
        id: 'test-id-2',
        url: 'https://example.com/article2',
        mode: 'quick',
        status: 'completed',
        translations: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      getAllTasksMock.mockResolvedValueOnce([pendingTask, completedTask]);

      await recoverCrashedTasks();

      // Verify the pending task was marked as paused and saved
      expect(saveTaskMock).toHaveBeenCalledWith(
        'https://example.com/article1',
        expect.objectContaining({ status: 'paused' })
      );

      // Verify only non-terminal tasks were updated (completed not saved again)
      expect(saveTaskMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus', () => {
    it('returns task for URL', async () => {
      const task: TranslationTask = {
        id: 'test-id',
        url: 'https://example.com/article',
        mode: 'normal',
        status: 'completed',
        translations: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      getTaskMock.mockResolvedValueOnce(task);

      const result = await getStatus('https://example.com/article');
      expect(result).toEqual(task);
    });

    it('returns null for non-existent URL', async () => {
      getTaskMock.mockResolvedValueOnce(null);

      const result = await getStatus('https://example.com/nonexistent');
      expect(result).toBeNull();
    });
  });
});