import type { ProviderConfig, TranslationMode, ParagraphTranslation } from './types';

// WorkerInbound: messages from popup/content script TO Service Worker
export type WorkerInbound =
  | { type: 'GET_PROVIDER_CONFIG' }
  | { type: 'GET_PROVIDER_CONFIG_BY_ID'; providerId: string }
  | { type: 'SAVE_PROVIDER_CONFIG'; config: ProviderConfig }
  | { type: 'GET_LAST_MODE' }
  | { type: 'SAVE_LAST_MODE'; mode: TranslationMode }
  | { type: 'START_TRANSLATION'; mode: TranslationMode }
  | { type: 'GET_TASK_STATUS'; url: string }
  | { type: 'CANCEL_TRANSLATION' }
  | { type: 'RETRY_TRANSLATION' }
  | { type: 'CONTENT_READY'; url: string };

// WorkerOutbound: messages from Service Worker TO content script
export type WorkerOutbound =
  | { type: 'INJECT_TRANSLATION'; translations: ParagraphTranslation[] }
  | { type: 'TRANSLATION_PROGRESS'; step: string }
  | { type: 'TRANSLATION_COMPLETE'; translations: ParagraphTranslation[] }
  | { type: 'TRANSLATION_ERROR'; message: string }
  | { type: 'CLEAR_TRANSLATIONS' }
  | { type: 'SHOW_FLOATING_INDICATOR'; step: string; progress?: string };

// MSG constant derived from type discriminant values - single source of truth
const MSG_TYPES = {
  START_TRANSLATION: 'START_TRANSLATION',
  GET_TASK_STATUS: 'GET_TASK_STATUS',
  CANCEL_TRANSLATION: 'CANCEL_TRANSLATION',
  RETRY_TRANSLATION: 'RETRY_TRANSLATION',
  GET_PROVIDER_CONFIG: 'GET_PROVIDER_CONFIG',
  GET_PROVIDER_CONFIG_BY_ID: 'GET_PROVIDER_CONFIG_BY_ID',
  SAVE_PROVIDER_CONFIG: 'SAVE_PROVIDER_CONFIG',
  GET_LAST_MODE: 'GET_LAST_MODE',
  SAVE_LAST_MODE: 'SAVE_LAST_MODE',
  CONTENT_READY: 'CONTENT_READY',
  TRANSLATION_PROGRESS: 'TRANSLATION_PROGRESS',
  INJECT_TRANSLATION: 'INJECT_TRANSLATION',
  TRANSLATION_COMPLETE: 'TRANSLATION_COMPLETE',
  TRANSLATION_ERROR: 'TRANSLATION_ERROR',
  CLEAR_TRANSLATIONS: 'CLEAR_TRANSLATIONS',
  SHOW_FLOATING_INDICATOR: 'SHOW_FLOATING_INDICATOR',
} as const;

export const MSG = MSG_TYPES;

export type MsgType = typeof MSG_TYPES[keyof typeof MSG_TYPES];