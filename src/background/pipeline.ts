import { BATCH_WORD_LIMIT } from '../shared/constants';
import { quickTranslate, analyzeArticle, translateWithContext, reviewTranslations, polishTranslations } from './translator';
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

  if (mode === 'normal') {
    return translateNormal(paragraphs, provider, options);
  }

  if (mode === 'refined') {
    return translateRefined(paragraphs, provider, options);
  }

  throw new Error(`Mode '${mode}' not yet implemented in pipeline`);
}

async function translateQuick(
  paragraphs: ParagraphTranslation[],
  provider: Provider,
  options?: PipelineOptions,
): Promise<ParagraphTranslation[]> {
  return processBatches(paragraphs, options, async (batch) =>
    quickTranslate(batch, '', provider)
  );
}

async function translateNormal(
  paragraphs: ParagraphTranslation[],
  provider: Provider,
  options?: PipelineOptions,
): Promise<ParagraphTranslation[]> {
  options?.onProgress?.({ step: 'analyze' });
  checkAbort(options);

  const fullText = options?.fullText ?? paragraphs.map(p => p.originalText).join('\n\n');
  const analysis = await analyzeArticle(fullText, provider);

  options?.onProgress?.({ step: 'translate' });

  return processBatches(paragraphs, options, async (batch) =>
    translateWithContext(batch, analysis, provider, 'normal')
  );
}

async function translateRefined(
  paragraphs: ParagraphTranslation[],
  provider: Provider,
  options?: PipelineOptions,
): Promise<ParagraphTranslation[]> {
  options?.onProgress?.({ step: 'analyze' });
  checkAbort(options);

  const fullText = options?.fullText ?? paragraphs.map(p => p.originalText).join('\n\n');
  const analysis = await analyzeArticle(fullText, provider);

  options?.onProgress?.({ step: 'translate' });

  const results = await processBatches(paragraphs, options, async (batch) =>
    translateWithContext(batch, analysis, provider, 'refined')
  );

  options?.onProgress?.({ step: 'review' });
  checkAbort(options);

  const reviewed = await reviewTranslations(results, provider);

  options?.onProgress?.({ step: 'polish' });
  checkAbort(options);

  const polished = await polishTranslations(reviewed, provider);

  return polished;
}

async function processBatches(
  paragraphs: ParagraphTranslation[],
  options: PipelineOptions | undefined,
  translateBatch: (batch: ParagraphTranslation[]) => Promise<ParagraphTranslation[]>,
): Promise<ParagraphTranslation[]> {
  const batches = splitIntoBatches(paragraphs);
  const totalBatches = batches.length;
  const results: ParagraphTranslation[] = [];

  for (let i = 0; i < batches.length; i++) {
    options?.onProgress?.({
      step: 'translate',
      batchProgress: { current: i + 1, total: totalBatches },
    });
    checkAbort(options);

    const batchResults = await translateBatch(batches[i]);
    results.push(...batchResults.map((p) => ({ ...p, batchIndex: i })));
  }

  return results;
}

function checkAbort(options: PipelineOptions | undefined): void {
  if (options?.signal?.aborted) {
    throw new AbortError('Translation cancelled');
  }
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