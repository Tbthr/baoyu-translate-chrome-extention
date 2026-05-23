import type { ProviderConfig, TranslationMode } from './types';

function storageSync(): chrome.storage.StorageArea {
  return chrome.storage.sync;
}

function storageLocal(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

export async function getProviderConfig(): Promise<ProviderConfig | null> {
  const result = await storageSync().get('provider_config');
  return (result.provider_config as ProviderConfig) ?? null;
}

export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  await storageSync().set({ provider_config: config });
}

export async function getLastMode(): Promise<TranslationMode> {
  const result = await storageSync().get('last_mode');
  return (result.last_mode as TranslationMode) ?? 'quick';
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

export async function getTask(urlHash: string): Promise<unknown> {
  const key = `task_${urlHash}`;
  const result = await storageLocal().get(key);
  return result[key] ?? null;
}

export async function saveTask(urlHash: string, task: unknown): Promise<void> {
  const key = `task_${urlHash}`;
  await storageLocal().set({ [key]: task });
}

export async function removeTask(urlHash: string): Promise<void> {
  const key = `task_${urlHash}`;
  await storageLocal().remove(key);
}

export async function getCache(urlHash: string): Promise<unknown> {
  const key = `cache_${urlHash}`;
  const result = await storageLocal().get(key);
  return result[key] ?? null;
}

export async function saveCache(urlHash: string, cache: unknown): Promise<void> {
  const key = `cache_${urlHash}`;
  await storageLocal().set({ [key]: cache });
}

export async function removeCache(urlHash: string): Promise<void> {
  const key = `cache_${urlHash}`;
  await storageLocal().remove(key);
}

export async function getAllCacheKeys(): Promise<string[]> {
  const all = await storageLocal().get(null);
  return Object.keys(all).filter((k) => k.startsWith('cache_'));
}

export function urlHash(url: string): string {
  let hash = 0;
  const normalized = new URL(url).href;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}
