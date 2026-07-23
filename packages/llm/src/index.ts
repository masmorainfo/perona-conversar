// ─── Tipos de tarefa do COS ───────────────────────────────────────────────────
// Cada tarefa tem um perfil: velocidade vs qualidade vs criatividade.
// O router usa isso para escolher o modelo certo automaticamente.
export type TaskType =
  | 'localization'   // CLP — decisão editorial por termo (KEEP/TRANSLATE/ADAPT/EXPLAIN/REMOVE)
  | 'classification' // Detecção de tema, categorização — simples e rápido
  | 'embedding'      // Vetorização semântica — modelo especializado
  | 'editorial'      // Análise editorial, aprovação de pauta — raciocínio médio
  | 'research'       // Pesquisa factual e síntese — raciocínio estruturado
  | 'observer'       // Agrupamento de sinais, Jaccard, clustering — raciocínio médio
  | 'script'         // Geração de roteiro — alta qualidade, criatividade
  | 'humanizer'      // Pós-processamento de roteiro (voz humana PT-BR) — alta qualidade
  | 'cinematic-review' // Assinatura Editorial — alta qualidade de raciocínio de marca
  | 'vision';        // Análise de imagem/thumbnail — modelo multimodal

// ─── Mapa de modelos por tarefa ───────────────────────────────────────────────
// Configurável via env; os padrões são os modelos gratuitos mais adequados da NVIDIA NIM.
// Para OpenAI, o router sempre cai em gpt-4o-mini (modelo não é configurado por tarefa).
export const NVIDIA_TASK_MODELS: Record<TaskType, string> = {
  localization:   process.env.NVIDIA_MODEL_EDITORIAL      || 'meta/llama-3.3-70b-instruct',        // decisão editorial inteligente
  classification: process.env.NVIDIA_MODEL_CLASSIFICATION || 'meta/llama-3.1-8b-instruct',        // rápido e barato
  embedding:      process.env.NVIDIA_MODEL_EMBEDDING      || 'nvidia/nv-embedqa-e5-v5',             // especializado em embeddings (substituiu nv-embed-v2 descontinuado)
  editorial:      process.env.NVIDIA_MODEL_EDITORIAL      || 'meta/llama-3.3-70b-instruct',        // raciocínio estruturado
  research:       process.env.NVIDIA_MODEL_EDITORIAL      || 'meta/llama-3.3-70b-instruct',        // raciocínio estruturado
  observer:       process.env.NVIDIA_MODEL_OBSERVER       || 'meta/llama-3.3-70b-instruct',        // raciocínio estruturado
  script:         process.env.NVIDIA_MODEL_SCRIPT         || 'meta/llama-3.3-70b-instruct',        // qualidade criativa (free tier estável)
  humanizer:      process.env.NVIDIA_MODEL_HUMANIZER      || 'meta/llama-3.3-70b-instruct',        // instruções de tom/voz (free tier estável)
  'cinematic-review': process.env.NVIDIA_MODEL_EDITORIAL  || 'meta/llama-3.3-70b-instruct',
  vision:         process.env.NVIDIA_MODEL_VISION         || 'meta/llama-3.2-90b-vision-instruct', // multimodal (substituiu phi-3.5 não encontrado)
};

export interface CompletionOptions {
  model?: string;       // sobrescreve o roteamento automático quando fornecido
  task?: TaskType;      // informa ao router qual tarefa está sendo executada
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  systemPrompt?: string;
}

export interface LLMProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  completeVision?(prompt: string, imageUrl: string, options?: CompletionOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
}

/** Word-level timestamp returned by TTS providers that support it (e.g. ElevenLabs) */
export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
}

/** Result of speech generation — audio file path + optional word-level timing */
export interface SpeechResult {
  audioPath: string;
  wordTimestamps?: WordTimestamp[];
}

export interface VoiceProvider {
  generateSpeech(text: string, outputPath: string): Promise<string | SpeechResult>;
}

export interface ImageProvider {
  generateImage(prompt: string, outputPath: string): Promise<string>;
}

import type { LocalizationDecision } from '@cos/types';

/** Contrato CLP — localização editorial inteligente */
export interface LocalizationProvider {
  localizeBatch(
    items: Array<{ term: string; context?: string }>,
    targetLang?: string
  ): Promise<LocalizationDecision[]>;
}

export * from './providers/openai.js';
export * from './agents/vieAgent.js';

