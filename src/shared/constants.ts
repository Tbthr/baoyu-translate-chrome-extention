import type { ProviderConfig } from './types';

export interface PresetProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  color: string;
}

export const PRESET_PROVIDERS: PresetProvider[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', color: '#10a37f' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', color: '#4d6bfe' },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', color: '#6c5ce7' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-6', color: '#d4a574' },
  { id: 'custom', name: '自定义', baseUrl: '', model: '', color: '#aaa' },
];

export function getPresetById(id: string): PresetProvider | undefined {
  return PRESET_PROVIDERS.find((p) => p.id === id);
}

export function makeProviderConfig(preset: PresetProvider, apiKey: string): ProviderConfig {
  return {
    id: preset.id,
    name: preset.name,
    baseUrl: preset.baseUrl,
    apiKey,
    model: preset.model,
    color: preset.color,
  };
}

export const MODE_RETRY_LIMITS: Record<string, number> = {
  quick: 2,
  normal: 2,
  refined: 3,
};

export const CACHE_TTL_MS = 86400000; // 24 hours
export const CACHE_MAX_ENTRIES = 20;
export const BATCH_WORD_LIMIT = 4000;
