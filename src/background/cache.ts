import type { TranslationCache, ParagraphTranslation, TranslationMode } from '../shared/types';
import { getCache, saveCache, removeCache, getAllCacheKeys, urlHash } from '../shared/storage';
import { CACHE_TTL_MS, CACHE_MAX_ENTRIES } from '../shared/constants';

export async function getCachedTranslation(pageUrl: string): Promise<TranslationCache | null> {
  const hash = urlHash(pageUrl);
  const cached = (await getCache(hash)) as TranslationCache | null;
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    await removeCache(hash);
    return null;
  }

  return cached;
}

export async function saveTranslationCache(
  pageUrl: string,
  translations: ParagraphTranslation[],
  mode: TranslationMode,
  providerId: string,
): Promise<void> {
  const hash = urlHash(pageUrl);
  await evictIfNeeded();
  await saveCache(hash, {
    url: pageUrl,
    translations,
    mode,
    providerId,
    timestamp: Date.now(),
  });
}

async function evictIfNeeded(): Promise<void> {
  const keys = await getAllCacheKeys();
  if (keys.length < CACHE_MAX_ENTRIES) return;

  const entries: Array<{ key: string; timestamp: number }> = [];
  for (const key of keys) {
    const data = (await getCache(key.replace('cache_', ''))) as TranslationCache | null;
    if (data) {
      entries.push({ key, timestamp: data.timestamp });
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  const toRemove = entries.slice(0, entries.length - CACHE_MAX_ENTRIES + 1);
  for (const entry of toRemove) {
    await removeCache(entry.key.replace('cache_', ''));
  }
}
