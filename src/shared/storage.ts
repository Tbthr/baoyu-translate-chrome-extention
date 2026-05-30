import { z } from 'zod';
import type { ProviderConfig, TranslationMode, TranslationTask, TranslationCache, ParagraphTranslation } from './types';
import { CACHE_TTL_MS, CACHE_MAX_ENTRIES } from './constants';

function storageSync(): chrome.storage.StorageArea {
  return chrome.storage.sync;
}

function storageLocal(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

function urlHash(url: string): string {
  let hash = 0;
  const normalized = new URL(url).href;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

const translationTaskSchema = z.object({
  id: z.string(),
  url: z.string(),
  mode: z.enum(['quick', 'normal', 'refined']),
  status: z.enum(['pending', 'analyzing', 'translating', 'reviewing', 'polishing', 'completed', 'failed', 'paused']),
  currentStep: z.enum(['analyze', 'translate', 'review', 'polish']).optional(),
  totalBatches: z.number().optional(),
  currentBatch: z.number().optional(),
  analysis: z.object({
    domain: z.string(),
    glossary: z.array(z.object({ term: z.string(), translation: z.string(), note: z.string() })),
    culturalNotes: z.array(z.object({ term: z.string(), explanation: z.string() })),
    difficulties: z.array(z.string()),
    summary: z.string(),
  }).optional(),
  translations: z.array(z.object({
    index: z.number(),
    originalText: z.string(),
    translatedText: z.string(),
    isCodeBlock: z.boolean(),
    batchIndex: z.number(),
    elementId: z.string(),
  })),
  error: z.object({
    step: z.enum(['analyze', 'translate', 'review', 'polish']),
    batchIndex: z.number(),
    message: z.string(),
    retryCount: z.number(),
    maxRetries: z.number(),
  }).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export async function getTask(url: string): Promise<TranslationTask | null> {
  const key = `task_${urlHash(url)}`;
  const result = await storageLocal().get(key);
  const raw = result[key];
  if (!raw) return null;
  const parsed = translationTaskSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function getAllTasks(): Promise<TranslationTask[]> {
  const all = await storageLocal().get(null);
  const taskKeys = Object.keys(all).filter((k) => k.startsWith('task_'));
  const tasks: TranslationTask[] = [];
  for (const key of taskKeys) {
    const parsed = translationTaskSchema.safeParse(all[key]);
    if (parsed.success) tasks.push(parsed.data);
  }
  return tasks;
}

export async function saveTask(url: string, task: TranslationTask): Promise<void> {
  const key = `task_${urlHash(url)}`;
  await storageLocal().set({ [key]: task });
}

export async function removeTask(url: string): Promise<void> {
  const key = `task_${urlHash(url)}`;
  await storageLocal().remove(key);
}

// ── Translation cache (chrome.storage.local, with TTL + FIFO eviction) ──

const translationCacheSchema = z.object({
  url: z.string(),
  translations: z.array(z.object({
    index: z.number(),
    originalText: z.string(),
    translatedText: z.string(),
    isCodeBlock: z.boolean(),
    batchIndex: z.number(),
    elementId: z.string(),
  })),
  mode: z.enum(['quick', 'normal', 'refined']),
  providerId: z.string(),
  timestamp: z.number(),
});

export async function getCachedTranslation(url: string): Promise<TranslationCache | null> {
  const key = `cache_${urlHash(url)}`;
  const result = await storageLocal().get(key);
  const raw = result[key];
  if (!raw) return null;
  const parsed = translationCacheSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (Date.now() - parsed.data.timestamp > CACHE_TTL_MS) {
    await storageLocal().remove(key);
    return null;
  }
  return parsed.data;
}

export async function saveCachedTranslation(
  url: string,
  translations: ParagraphTranslation[],
  mode: TranslationMode,
  providerId: string,
): Promise<void> {
  const hash = urlHash(url);
  await evictIfNeeded();
  await storageLocal().set({
    [`cache_${hash}`]: { url, translations, mode, providerId, timestamp: Date.now() },
  });
}

async function evictIfNeeded(): Promise<void> {
  const all = await storageLocal().get(null);
  const cacheKeys = Object.keys(all).filter((k) => k.startsWith('cache_'));
  if (cacheKeys.length < CACHE_MAX_ENTRIES) return;

  const entries: Array<{ key: string; timestamp: number }> = [];
  for (const key of cacheKeys) {
    const data = all[key] as { timestamp?: number };
    if (data?.timestamp) entries.push({ key, timestamp: data.timestamp });
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  const toRemove = entries.slice(0, entries.length - CACHE_MAX_ENTRIES + 1);
  for (const entry of toRemove) {
    await storageLocal().remove(entry.key);
  }
}

// ── Provider config (chrome.storage.sync) ──

export async function getProviderConfig(): Promise<ProviderConfig | null> {
  const result = await storageSync().get(['provider_config', 'provider_configs']);
  const current = (result.provider_config as { id: string }) ?? null;
  if (!current?.id) return null;
  const allConfigs = (result.provider_configs as Record<string, ProviderConfig>) ?? {};
  return allConfigs[current.id] ?? null;
}

export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  const result = await storageSync().get('provider_configs');
  const allConfigs = (result.provider_configs as Record<string, ProviderConfig>) ?? {};
  allConfigs[config.id] = config;
  await storageSync().set({ provider_config: { id: config.id }, provider_configs: allConfigs });
}

export async function getProviderConfigById(id: string): Promise<ProviderConfig | null> {
  const result = await storageSync().get('provider_configs');
  const allConfigs = (result.provider_configs as Record<string, ProviderConfig>) ?? {};
  return allConfigs[id] ?? null;
}

export async function getLastMode(): Promise<TranslationMode> {
  const result = await storageSync().get('last_mode');
  return (result.last_mode as TranslationMode) ?? 'normal';
}

export async function saveLastMode(mode: TranslationMode): Promise<void> {
  await storageSync().set({ last_mode: mode });
}

export async function getMoreSettingsOpen(): Promise<boolean> {
  const result = await storageSync().get('more_settings_open');
  return (result.more_settings_open as boolean) ?? false;
}

export async function saveMoreSettingsOpen(open: boolean): Promise<void> {
  await storageSync().set({ more_settings_open: open });
}
