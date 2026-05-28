export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  color: string;
}

export type TranslationMode = 'quick' | 'normal' | 'refined';

export type TaskStatus =
  | 'pending'
  | 'analyzing'
  | 'translating'
  | 'reviewing'
  | 'polishing'
  | 'completed'
  | 'failed'
  | 'paused';

export type TranslationStep = 'analyze' | 'translate' | 'review' | 'polish';

export interface GlossaryEntry {
  term: string;
  translation: string;
  note: string;
}

export interface CulturalNote {
  term: string;
  explanation: string;
}

export interface AnalysisResult {
  domain: string;
  glossary: GlossaryEntry[];
  culturalNotes: CulturalNote[];
  difficulties: string[];
  summary: string;
}

export interface ParagraphTranslation {
  index: number;
  originalSelector: string;
  originalText: string;
  translatedText: string;
  isCodeBlock: boolean;
  batchIndex: number;
}

export interface TranslationTask {
  id: string;
  url: string;
  mode: TranslationMode;
  status: TaskStatus;
  currentStep?: TranslationStep;
  totalBatches?: number;
  currentBatch?: number;
  analysis?: AnalysisResult;
  translations: ParagraphTranslation[];
  error?: ErrorInfo;
  createdAt: number;
  updatedAt: number;
}

export interface TranslationCache {
  url: string;
  translations: ParagraphTranslation[];
  mode: TranslationMode;
  providerId: string;
  timestamp: number;
}

export interface ErrorInfo {
  step: TranslationStep;
  batchIndex: number;
  message: string;
  retryCount: number;
  maxRetries: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

export interface ChatResult {
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface PipelineProgress {
  step: string;
  batchProgress?: { current: number; total: number };
}

export interface PipelineOptions {
  onProgress?: (progress: PipelineProgress) => void;
  signal?: AbortSignal;
}
