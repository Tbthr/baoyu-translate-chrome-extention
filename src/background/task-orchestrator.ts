import type { TranslationTask, TranslationMode, ParagraphTranslation } from '../shared/types';
import type { Provider } from './pipeline';
import {
  getTask,
  saveTask,
  removeTask,
  getCachedTranslation,
  saveCachedTranslation,
  getAllTasks,
} from '../shared/storage';
import { translate, AbortError } from './pipeline';

// ── TaskCallbacks interface (domain language) ─────────────────────────────────

export interface TaskCallbacks {
  onProgress: (step: string, batch?: { current: number; total: number }) => void;
  onComplete: (translations: ParagraphTranslation[]) => void;
  onError: (error: { message: string }) => void;
}

// ── Internal module state ──────────────────────────────────────────────────────

let activeTaskId: string | null = null;
let activeUrl: string | null = null;
let abortController: AbortController | null = null;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start a new translation task.
 *
 * @param mode - Translation mode (quick, normal, refined)
 * @param url - Target URL
 * @param config - Provider configuration
 * @param extraction - Pre-extracted content from the page
 * @param callbacks - Domain-typed callbacks
 */
export async function start(
  mode: TranslationMode,
  url: string,
  config: Provider,
  extraction: { paragraphs: ParagraphTranslation[]; fullText: string },
  callbacks: TaskCallbacks,
): Promise<void> {
  // Abort any existing task
  abortController?.abort();
  abortController = new AbortController();
  activeTaskId = crypto.randomUUID();
  activeUrl = url;

  // Create task
  const task: TranslationTask = {
    id: activeTaskId,
    url,
    mode,
    status: 'pending',
    translations: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveTask(url, task);

  // Check cache
  const cached = await getCachedTranslation(url);
  if (cached) {
    task.status = 'completed';
    task.translations = cached.translations;
    await saveTask(url, task);
    callbacks.onComplete(cached.translations);
    return;
  }

  // Populate task with extracted paragraphs
  task.translations = extraction.paragraphs;
  await saveTask(url, task);

  // Run pipeline
  runTranslation(task, extraction.fullText, config, callbacks).catch((err: unknown) => {
    if (err instanceof AbortError) return;

    task.status = 'failed';
    task.error = {
      step: task.currentStep ?? 'translate',
      batchIndex: task.currentBatch ?? 0,
      message: err instanceof Error ? err.message : String(err),
      retryCount: 0,
      maxRetries: 2,
    };
    saveTask(url, task);
    callbacks.onError({ message: task.error.message });
  });
}

/**
 * Cancel the active translation task.
 *
 * @param url - The URL to cancel (must match activeUrl)
 */
export async function cancel(url?: string): Promise<void> {
  abortController?.abort();
  abortController = null;
  activeTaskId = null;

  if (activeUrl && (!url || url === activeUrl)) {
    await removeTask(activeUrl);
    activeUrl = null;
  }
}

/**
 * Retry a failed translation task.
 *
 * @param url - The URL to retry
 * @param config - Provider configuration (for running the pipeline)
 * @param callbacks - Domain-typed callbacks
 */
export async function retry(url: string, config: Provider, callbacks: TaskCallbacks): Promise<void> {
  const task = await getTask(url);
  if (!task) return;

  // Abort any existing controller
  abortController?.abort();
  abortController = new AbortController();
  activeTaskId = task.id;
  activeUrl = url;

  runTranslation(task, '', config, callbacks).catch((err: unknown) => {
    if (err instanceof AbortError) return;

    task.status = 'failed';
    task.error = {
      step: task.currentStep ?? 'translate',
      batchIndex: task.currentBatch ?? 0,
      message: err instanceof Error ? err.message : String(err),
      retryCount: 0,
      maxRetries: 2,
    };
    saveTask(url, task);
    callbacks.onError({ message: task.error.message });
  });
}

/**
 * Get the status of a translation task.
 *
 * @param url - The URL to query
 */
export async function getStatus(url: string): Promise<TranslationTask | null> {
  if (!url) return null;
  return getTask(url);
}

/**
 * Recover crashed tasks by marking them as paused.
 * Scans storage for tasks in non-terminal states.
 */
export async function recoverCrashedTasks(): Promise<void> {
  const allTasks = await getAllTasks();

  for (const task of allTasks) {
    if (task.status !== 'completed' && task.status !== 'failed') {
      task.status = 'paused';
      await saveTask(task.url, task);
    }
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

const STEP_NAMES: Record<string, string> = {
  analyze: '正在分析',
  translate: '正在翻译',
  review: '正在审校',
  polish: '正在润色',
};

function stepName(step: string): string {
  return STEP_NAMES[step] ?? step;
}

async function runTranslation(
  task: TranslationTask,
  fullText: string,
  config: Provider,
  callbacks: TaskCallbacks,
): Promise<void> {
  const { url } = task;
  const provider = {
    baseUrl: config.baseUrl ?? '',
    apiKey: config.apiKey ?? '',
    model: config.model ?? '',
  };

  const translations = await translate(task.translations, task.mode, provider, {
    fullText,
    signal: abortController!.signal,
    onProgress: (progress) => {
      if (progress.batchProgress) {
        callbacks.onProgress('正在翻译', progress.batchProgress);
      } else {
        callbacks.onProgress(stepName(progress.step));
      }
    },
  });

  task.translations = translations;
  task.status = 'completed';
  task.updatedAt = Date.now();
  await saveTask(url, task);

  // Save to cache if we have a provider id
  const providerId = (config as { id?: string }).id;
  if (providerId) {
    await saveCachedTranslation(url, translations, task.mode, providerId);
  }

  callbacks.onComplete(translations);
}