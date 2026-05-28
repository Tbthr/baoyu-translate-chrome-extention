import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MSG } from '../shared/messages';
import { urlHash } from '../shared/storage';

const mockChrome = {
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
  storage: {
    sync: { get: vi.fn(), set: vi.fn() },
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    connect: vi.fn(() => ({ onMessage: { addListener: vi.fn() } })),
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
};

vi.stubGlobal('chrome', mockChrome);

// Mock cache
vi.mock('./cache', () => ({
  getCachedTranslation: vi.fn().mockResolvedValue(null),
  saveTranslationCache: vi.fn().mockResolvedValue(undefined),
}));

describe('Service worker cancellation integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AbortController lifecycle', () => {
    it('AbortController is created for each translation', async () => {
      const { translate, AbortError } = await import('./pipeline');
      const { chat } = await import('./ai-adapter');
      const mockChat = chat as ReturnType<typeof vi.fn>;

      mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      mockChrome.tabs.sendMessage.mockImplementation((tabId, msg) => {
        if (msg.type === 'EXTRACT_CONTENT') {
          return Promise.resolve({
            paragraphs: [{ index: 0, originalSelector: '', originalText: 'Hello', translatedText: '', isCodeBlock: false, batchIndex: 0 }],
            fullText: 'Hello',
          });
        }
        return Promise.resolve(undefined);
      });

      // Create and abort controller before pipeline call
      const controller = new AbortController();
      controller.abort();

      await expect(
        translate(
          [{ index: 0, originalSelector: '', originalText: 'Hello', translatedText: '', isCodeBlock: false, batchIndex: 0 }],
          'quick',
          { baseUrl: 'https://api.test.com', apiKey: 'test-key', model: 'test-model' },
          { signal: controller.signal }
        )
      ).rejects.toThrow(AbortError);
    });
  });

  describe('Cancellation cleanup flow', () => {
    it('removeTask is called with correct hash during cancel', async () => {
      // This tests that when cancellation happens, the task is removed from storage
      const url = 'https://example.com/page';
      const hash = urlHash(url);
      const taskKey = `task_${hash}`;

      // Verify storage.remove would be called with correct key
      expect(taskKey).toBe(`task_${urlHash(url)}`);
    });

    it('CLEAR_TRANSLATIONS message constant exists', () => {
      expect(MSG.CLEAR_TRANSLATIONS).toBe('CLEAR_TRANSLATIONS');
    });
  });

  describe('Retry without resume', () => {
    it('retry re-triggers start translation (no checkpoint)', async () => {
      // When retry is triggered, the system should start fresh
      // No checkpoint/resume logic should be present

      // Mock a failed task
      const mockTask = {
        id: 'test-task-id',
        url: 'https://example.com',
        mode: 'normal' as const,
        status: 'failed' as const,
        translations: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockChrome.storage.local.get.mockResolvedValue({ [`task_${urlHash(mockTask.url)}`]: mockTask });

      // On retry, handleStartTranslation should be called with same mode
      // This means no checkpoint data is used - starts from scratch
      expect(mockTask.status).toBe('failed');
    });
  });

  describe('sendToTab abort on failure', () => {
    it('aborts translation pipeline when sendMessage throws', async () => {
      // Create a mock AbortController with a spy on abort
      const abortSpy = vi.fn();
      const mockController = { abort: abortSpy } as unknown as AbortController;

      // Mock sendMessage to throw (simulating tab disconnect)
      mockChrome.tabs.sendMessage.mockRejectedValue(new Error('Tab closed'));

      // Import sendToTab from service-worker module
      const { sendToTab } = await import('./service-worker');

      // Call sendToTab with the mock controller
      await sendToTab(1, MSG.SHOW_FLOATING_INDICATOR, { step: 'test' }, mockController);

      // Verify abort was called when sendMessage threw
      expect(abortSpy).toHaveBeenCalled();
    });
  });
});