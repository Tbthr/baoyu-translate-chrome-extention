import { chat } from './ai-adapter';
import { BATCH_WORD_LIMIT, MODE_RETRY_LIMITS } from '../shared/constants';
import type { AnalysisResult, ParagraphTranslation, ChatMessage, TranslationMode, PipelineOptions } from '../shared/types';

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

export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

// =============================================================================
// Private translator functions (absorbed from translator.ts)
// =============================================================================

async function quickTranslate(
  batch: ParagraphTranslation[],
  _fullText: string,
  provider: Provider,
): Promise<ParagraphTranslation[]> {
  if (batch.length === 0) return [];

  const batchText = batch.map((p) => p.originalText).join('\n\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一位专业的英中翻译专家。将以下英文文章翻译为中文。

翻译要求：
- 信达雅，译文自然流畅，读起来像中文原创
- 对中文读者不熟悉的外国品牌、平台、机构，首次出现时用括号加注解释（如：Deliveroo（英国外卖平台））
- 关键术语全文统一翻译
- 保留所有 markdown 格式
- 优先使用生动的中文口语，保留原文幽默感

直接输出翻译后的中文文章。按照原文段落顺序输出，每个段落之间用空行分隔。`,
    },
    { role: 'user', content: batchText },
  ];

  const result = await withRetry(() => chat({ ...provider, messages, temperature: 0.3 }), 2);
  return parseTranslationResponse(result.content, batch);
}

async function analyzeArticle(
  fullText: string,
  provider: Provider,
): Promise<AnalysisResult> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `分析以下英文文章，返回 JSON 对象：
{
  "domain": "文章领域",
  "glossary": [{"term": "英文术语", "translation": "中文翻译", "note": "使用说明"}],
  "culturalNotes": [{"term": "英文术语/品牌名", "explanation": "对中文读者的简要解释"}],
  "difficulties": ["翻译难点1", "翻译难点2"],
  "summary": "文章摘要"
}

要求：
1. glossary 包含所有需要统一翻译的关键术语
2. culturalNotes 列出所有中文读者可能不熟悉的外国品牌、平台、机构、文化概念，附简要解释
3. difficulties 列出翻译中的主要挑战

只输出 JSON，不要其他内容。`,
    },
    { role: 'user', content: fullText },
  ];

  const result = await withRetry(() => chat({ ...provider, messages, temperature: 0.3 }), 2);
  return parseAnalysisResult(result.content);
}

async function translateWithContext(
  batch: ParagraphTranslation[],
  analysis: AnalysisResult,
  provider: Provider,
  mode: TranslationMode,
): Promise<ParagraphTranslation[]> {
  if (batch.length === 0) return [];

  const glossaryStr = analysis.glossary.map((g) => `${g.term} → ${g.translation}（${g.note}）`).join('\n');
  const culturalStr = analysis.culturalNotes.map((c) => `${c.term}: ${c.explanation}`).join('\n');
  const contextBlock = `文章领域：${analysis.domain}\n术语表：\n${glossaryStr}\n文化注释：\n${culturalStr}\n翻译难点：${analysis.difficulties.join('、')}`;

  const batchText = batch.map((p) => p.originalText).join('\n\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一位专业的英中翻译专家。基于以下分析上下文翻译文章。

${contextBlock}

翻译要求：
- 信达雅，译文自然流畅，读起来像中文原创
- 对中文读者不熟悉的外国品牌、平台、机构，按 culturalNotes 中的解释，首次出现时用括号加注
- 术语翻译与术语表一致
- 保留所有 markdown 格式
- 优先使用生动的中文口语，保留原文幽默感

按照原文段落顺序输出翻译，每个段落之间用空行分隔。`,
    },
    { role: 'user', content: batchText },
  ];

  const result = await withRetry(
    () => chat({ ...provider, messages, temperature: 0.3 }),
    MODE_RETRY_LIMITS[mode] ?? 2,
  );

  return parseTranslationResponse(result.content, batch);
}

async function reviewTranslations(
  translations: ParagraphTranslation[],
  provider: Provider,
): Promise<ParagraphTranslation[]> {
  const BATCH_SIZE = 50;
  const results: ParagraphTranslation[] = [];

  for (let i = 0; i < translations.length; i += BATCH_SIZE) {
    const batch = translations.slice(i, i + BATCH_SIZE);
    const pairs = batch.map((t) => JSON.stringify({ original: t.originalText, translated: t.translatedText })).join(',\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一位资深翻译审校专家。审校以下中英对照翻译，检查：
1. 翻译准确性（有无漏译、误译）
2. 术语一致性
3. 文化注释是否完整（外国品牌/平台/机构首次出现是否都有括号解释）
4. 翻译腔（是否存在欧化句式、不自然的表达）
5. 语句通顺度和幽默感传达

对每段返回审校后的最终译文。
如有修改，在译文自然流畅的前提下保留修改。

返回 JSON 数组，每个元素是对应段落的审校后译文字符串。
只输出 JSON 数组，不要其他内容。`,
      },
      { role: 'user', content: `[\n${pairs}\n]` },
    ];

    const result = await withRetry(() => chat({ ...provider, messages, temperature: 0.3 }), 3);
    const reviewed = parseReviewResponse(result.content, batch);
    results.push(...reviewed);
  }

  return results;
}

async function polishTranslations(
  translations: ParagraphTranslation[],
  provider: Provider,
): Promise<ParagraphTranslation[]> {
  const BATCH_SIZE = 50;
  const results: ParagraphTranslation[] = [];

  for (let i = 0; i < translations.length; i += BATCH_SIZE) {
    const batch = translations.slice(i, i + BATCH_SIZE);
    const texts = batch.map((t) => JSON.stringify(t.translatedText)).join(',\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一位中文润色专家。对以下译文进行最终润色：
1. 消除翻译腔，确保读起来像中文原创
2. 检查所有外国品牌/平台/机构首次出现时有括号解释
3. 提升文学性和可读性
4. 确保术语准确且一致
5. 保留原文幽默感和自嘲语气

返回润色后的 JSON 数组，每个元素是对应段落的润色后译文字符串。
只输出 JSON 数组，不要其他内容。`,
      },
      { role: 'user', content: `[\n${texts}\n]` },
    ];

    const result = await withRetry(() => chat({ ...provider, messages, temperature: 0.3 }), 3);
    const polished = parseReviewResponse(result.content, batch);
    results.push(...polished);
  }

  return results;
}

// =============================================================================
// Private helper functions
// =============================================================================

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }
  throw lastError!;
}

function parseTranslationResponse(
  content: string,
  originalBatch: ParagraphTranslation[],
): ParagraphTranslation[] {
  const lines = content.split(/\n\s*\n/).filter((l) => l.trim());
  const results: ParagraphTranslation[] = [];

  const nonCodeOriginals = originalBatch.filter((p) => !p.isCodeBlock);

  for (let i = 0; i < originalBatch.length; i++) {
    const original = originalBatch[i];
    if (original.isCodeBlock) {
      results.push({ ...original, batchIndex: 0 });
      continue;
    }

    const translatedIdx = nonCodeOriginals.indexOf(original);
    const translatedText = lines[translatedIdx]?.trim() ?? original.originalText;
    results.push({ ...original, translatedText, batchIndex: 0 });
  }

  return results;
}

function parseAnalysisResult(content: string): AnalysisResult {
  const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(jsonStr);
  return {
    domain: parsed.domain ?? '',
    glossary: parsed.glossary ?? [],
    culturalNotes: parsed.culturalNotes ?? [],
    difficulties: parsed.difficulties ?? [],
    summary: parsed.summary ?? '',
  };
}

function parseReviewResponse(
  content: string,
  originals: ParagraphTranslation[],
): ParagraphTranslation[] {
  const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let translations: string[];

  try {
    translations = JSON.parse(jsonStr);
  } catch {
    translations = content.split('\n').filter((l) => l.trim());
  }

  return originals.map((original, i) => ({
    ...original,
    translatedText: translations[i] ?? original.translatedText,
  }));
}

// =============================================================================
// Pipeline orchestration
// =============================================================================

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