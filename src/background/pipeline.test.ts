import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translate, AbortError } from './pipeline';
import type { ParagraphTranslation } from '../shared/types';

// Mock the ai-adapter module
vi.mock('./ai-adapter', () => ({
  chat: vi.fn(),
}));

import { chat } from './ai-adapter';

const mockChat = chat as ReturnType<typeof vi.fn>;

function makeParagraph(text: string, index: number, isCode = false): ParagraphTranslation {
  return {
    index,
    originalSelector: '',
    originalText: text,
    translatedText: '',
    isCodeBlock: isCode,
    batchIndex: 0,
  };
}

function mockChatResponse(translatedTexts: string[]) {
  mockChat.mockResolvedValue({
    content: translatedTexts.join('\n\n'),
  });
}

describe('Pipeline translate()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('quick mode produces correct translations', async () => {
    const paragraphs = [
      makeParagraph('Hello world', 0),
      makeParagraph('This is a test', 1),
    ];

    mockChatResponse(['你好世界', '这是一个测试']);

    const result = await translate(paragraphs, 'quick', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    });

    expect(result).toHaveLength(2);
    expect(result[0].translatedText).toBe('你好世界');
    expect(result[1].translatedText).toBe('这是一个测试');
  });

  it('emits step progress via onProgress callback', async () => {
    const paragraphs = [
      makeParagraph('Hello world', 0),
      makeParagraph('This is a test', 1),
    ];

    mockChatResponse(['你好世界', '这是一个测试']);

    const progressEvents: { step: string; batchProgress?: { current: number; total: number } }[] = [];

    await translate(paragraphs, 'quick', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    }, {
      onProgress: (progress) => progressEvents.push(progress),
    });

    expect(progressEvents.some(p => p.step === 'translate')).toBe(true);
    expect(progressEvents.some(p => p.batchProgress !== undefined)).toBe(true);
  });

  it('reports batch progress for multiple batches', async () => {
    // Create text that exceeds BATCH_WORD_LIMIT (4000) per batch
    // Each paragraph has ~300 words to ensure we get multiple batches
    const longText = Array(300).fill('word').join(' ');
    const paragraphs = Array.from({ length: 30 }, (_, i) =>
      makeParagraph(`${longText} paragraph ${i}`, i)
    );

    // First batch
    mockChat.mockResolvedValueOnce({
      content: Array(15).fill('翻译段落一').join('\n\n'),
    });
    // Second batch
    mockChat.mockResolvedValueOnce({
      content: Array(15).fill('翻译段落二').join('\n\n'),
    });
    // Third batch if needed
    mockChat.mockResolvedValueOnce({
      content: Array(0).fill('').join('\n\n'),
    });

    const progressEvents: { step: string; batchProgress?: { current: number; total: number } }[] = [];

    await translate(paragraphs, 'quick', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    }, {
      onProgress: (progress) => progressEvents.push(progress),
    });

    const batchProgressEvents = progressEvents.filter(p => p.batchProgress !== undefined);
    expect(batchProgressEvents.length).toBeGreaterThanOrEqual(2);
    expect(batchProgressEvents[0].batchProgress).toEqual({ current: 1, total: expect.any(Number) });
    expect(batchProgressEvents[1].batchProgress).toEqual({ current: 2, total: expect.any(Number) });
  });

  it('throws AbortError when signal is aborted during translation', async () => {
    const paragraphs = [
      makeParagraph('Hello world', 0),
      makeParagraph('This is a test', 1),
    ];

    mockChatResponse(['你好世界', '这是一个测试']);

    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    await expect(
      translate(paragraphs, 'quick', {
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        model: 'test-model',
      }, {
        signal: controller.signal,
      })
    ).rejects.toThrow(AbortError);
  });
});

describe('Pipeline normal mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normal mode produces correct translations via analyze → translate', async () => {
    const paragraphs = [
      makeParagraph('Hello world', 0),
      makeParagraph('This is a test', 1),
    ];
    const fullText = 'Hello world\n\nThis is a test';

    // First call: analyzeArticle
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        domain: 'general',
        glossary: [],
        culturalNotes: [],
        difficulties: [],
        summary: 'Test summary',
      }),
    });
    // Second call: translateWithContext
    mockChat.mockResolvedValueOnce({
      content: ['你好世界', '这是一个测试'].join('\n\n'),
    });

    const result = await translate(paragraphs, 'normal', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    }, { fullText });

    expect(result).toHaveLength(2);
    expect(result[0].translatedText).toBe('你好世界');
    expect(result[1].translatedText).toBe('这是一个测试');
    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  it('normal mode emits step progress for analyze and translate', async () => {
    const paragraphs = [makeParagraph('Hello world', 0)];

    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        domain: 'general',
        glossary: [],
        culturalNotes: [],
        difficulties: [],
        summary: 'Test',
      }),
    });
    mockChat.mockResolvedValueOnce({
      content: '你好世界',
    });

    const progressEvents: { step: string; batchProgress?: { current: number; total: number } }[] = [];

    await translate(paragraphs, 'normal', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    }, {
      fullText: 'Hello world',
      onProgress: (progress) => progressEvents.push(progress),
    });

    expect(progressEvents.some(p => p.step === 'analyze')).toBe(true);
    expect(progressEvents.some(p => p.step === 'translate')).toBe(true);
  });

  it('normal mode reports batch progress for multiple batches', async () => {
    const longText = Array(300).fill('word').join(' ');
    const paragraphs = Array.from({ length: 30 }, (_, i) =>
      makeParagraph(`${longText} paragraph ${i}`, i)
    );

    // analyzeArticle response
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        domain: 'general',
        glossary: [],
        culturalNotes: [],
        difficulties: [],
        summary: 'Test',
      }),
    });
    // First translate batch
    mockChat.mockResolvedValueOnce({
      content: Array(15).fill('翻译段落一').join('\n\n'),
    });
    // Second translate batch
    mockChat.mockResolvedValueOnce({
      content: Array(15).fill('翻译段落二').join('\n\n'),
    });

    const progressEvents: { step: string; batchProgress?: { current: number; total: number } }[] = [];

    await translate(paragraphs, 'normal', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    }, {
      fullText: paragraphs.map(p => p.originalText).join('\n\n'),
      onProgress: (progress) => progressEvents.push(progress),
    });

    const translateBatchEvents = progressEvents.filter(
      p => p.step === 'translate' && p.batchProgress !== undefined
    );
    expect(translateBatchEvents.length).toBeGreaterThanOrEqual(2);
    expect(translateBatchEvents[0].batchProgress).toEqual({ current: 1, total: expect.any(Number) });
    expect(translateBatchEvents[1].batchProgress).toEqual({ current: 2, total: expect.any(Number) });
  });

  it('normal mode aborts between steps when signal is aborted', async () => {
    const paragraphs = [makeParagraph('Hello world', 0)];
    const controller = new AbortController();

    // analyzeArticle completes
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        domain: 'general',
        glossary: [],
        culturalNotes: [],
        difficulties: [],
        summary: 'Test',
      }),
    });
    // Abort before translate
    controller.abort();

    await expect(
      translate(paragraphs, 'normal', {
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        model: 'test-model',
      }, {
        fullText: 'Hello world',
        signal: controller.signal,
      })
    ).rejects.toThrow(AbortError);
  });
});

describe('empty input and batch boundary conditions', () => {

  it('handles empty input gracefully', async () => {
    mockChatResponse(['你好世界', '这是一个测试']);

    const result = await translate([], 'quick', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    });

    expect(result).toHaveLength(0);
  });

  it('handles single paragraph exceeding BATCH_WORD_LIMIT', async () => {
    // Create a single paragraph with 5000 words (exceeds BATCH_WORD_LIMIT of 4000)
    const longText = Array(5000).fill('word').join(' ');
    const paragraphs = [makeParagraph(longText, 0)];

    // Should still produce one batch, even though it exceeds the limit
    mockChat.mockResolvedValueOnce({
      content: '翻译结果',
    });

    const progressEvents: { step: string; batchProgress?: { current: number; total: number } }[] = [];

    const result = await translate(paragraphs, 'quick', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    }, {
      onProgress: (progress) => progressEvents.push(progress),
    });

    expect(result).toHaveLength(1);
    // Should report one batch
    const batchProgressEvents = progressEvents.filter(p => p.batchProgress !== undefined);
    expect(batchProgressEvents.length).toBe(1);
    expect(batchProgressEvents[0].batchProgress).toEqual({ current: 1, total: 1 });
  });

  it('handles paragraphs that exactly hit BATCH_WORD_LIMIT', async () => {
    // Create paragraphs that exactly hit the limit at the boundary
    // BATCH_WORD_LIMIT is 4000 words
    // First paragraph: 4000 words (fills first batch)
    // Second paragraph: 1 word (starts second batch)
    const firstText = Array(4000).fill('word').join(' ');
    const secondText = 'test';

    const paragraphs = [
      makeParagraph(firstText, 0),
      makeParagraph(secondText, 1),
    ];

    // First batch
    mockChat.mockResolvedValueOnce({
      content: '翻译段落一',
    });
    // Second batch
    mockChat.mockResolvedValueOnce({
      content: '翻译段落二',
    });

    const progressEvents: { step: string; batchProgress?: { current: number; total: number } }[] = [];

    await translate(paragraphs, 'quick', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    }, {
      onProgress: (progress) => progressEvents.push(progress),
    });

    const batchProgressEvents = progressEvents.filter(p => p.batchProgress !== undefined);
    expect(batchProgressEvents.length).toBe(2);
    expect(batchProgressEvents[0].batchProgress).toEqual({ current: 1, total: 2 });
    expect(batchProgressEvents[1].batchProgress).toEqual({ current: 2, total: 2 });
  });
});