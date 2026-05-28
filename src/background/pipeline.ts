import { BATCH_WORD_LIMIT } from '../shared/constants';
import { quickTranslate } from './translator';
import type { ParagraphTranslation, TranslationMode, PipelineOptions, PipelineProgress } from '../shared/types';

export interface Provider {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export async function translate(
  paragraphs: ParagraphTranslation[],
  mode: TranslationMode,
  provider: Provider,
  options?: PipelineOptions,
): Promise<ParagraphTranslation[]> {
  if (mode === 'quick') {
    return translateQuick(paragraphs, provider, options);
  }

  throw new Error(`Mode '${mode}' not yet implemented in pipeline`);
}

async function translateQuick(
  paragraphs: ParagraphTranslation[],
  provider: Provider,
  options?: PipelineOptions,
): Promise<ParagraphTranslation[]> {
  const batches = splitIntoBatches(paragraphs);
  const totalBatches = batches.length;
  const results: ParagraphTranslation[] = [];

  for (let i = 0; i < batches.length; i++) {
    options?.onProgress?.({
      step: 'translate',
      batchProgress: { current: i + 1, total: totalBatches },
    });

    if (options?.signal?.aborted) {
      throw new AbortError('Translation cancelled');
    }

    const batchResults = await quickTranslate(batches[i], '', provider);
    results.push(...batchResults.map((p) => ({ ...p, batchIndex: i })));
  }

  return results;
}

function splitIntoBatches(paragraphs: ParagraphTranslation[]): ParagraphTranslation[][] {
  const batches: ParagraphTranslation[][] = [];
  let currentBatch: ParagraphTranslation[] = [];
  let currentWordCount = 0;

  for (const p of paragraphs) {
    const wordCount = p.originalText.split(/\s+/).length;
    if (currentWordCount + wordCount > BATCH_WORD_LIMIT && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentWordCount = 0;
    }
    currentBatch.push(p);
    currentWordCount += wordCount;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches.length > 0 ? batches : [paragraphs];
}

export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}