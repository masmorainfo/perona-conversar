/**
 * @cos/cgl-writer — Pacote compartilhado de leitura/escrita na Cinematic Genome Library.
 *
 * Responsabilidades:
 * - Carregar entradas existentes de uma área
 * - Gerenciar pending_research.json (propostas KDR aguardando aprovação)
 * - Aprovar ou rejeitar entradas pendentes → gravar na CGL
 * - Atualizar index.json após cada inserção
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve caminho absoluto do CGL relativo a este pacote (packages/knowledge/cgl-writer/dist/ → ../../cgl)
const CGL_ROOT = path.resolve(__dirname, '../../cgl');
const PENDING_PATH = path.join(CGL_ROOT, 'pending_research.json');
const INDEX_PATH = path.join(CGL_ROOT, 'index.json');

// 13 áreas válidas do CGL
export const VALID_AREAS = [
  'fotografia', 'storytelling', 'ritmo', 'montagem', 'som', 'cor',
  'futebol', 'emocoes', 'simbolismo', 'cinema', 'referencias',
  'documentarios', 'linguagem_visual',
] as const;

export type CGLArea = (typeof VALID_AREAS)[number];

export interface CGLEntry {
  id: string;
  concept: string;
  description: string;
  tags: string[];
  canon_link?: string;
  source: 'manual' | 'kdr';
  added_at: string;
}

export interface ResearchEntry {
  id: string;           // UUID temporário (gerado pelo KDR)
  area: CGLArea;
  concept: string;
  description: string;
  tags: string[];
  canon_link?: string;
  confidence: number;   // 0.0–1.0
  reasoning: string;
  source_url?: string;
  research_query: string;
  proposed_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface PendingFile {
  version: number;
  entries: ResearchEntry[];
}

interface AreaFile {
  area: string;
  version: number;
  entries: CGLEntry[];
}

interface IndexFile {
  version: number;
  areas: Array<{ file: string; area: string; entry_count: number }>;
  total_entries: number;
  last_updated: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJSON<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function writeJSON<T>(filePath: string, data: T): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function isValidArea(area: string): area is CGLArea {
  return (VALID_AREAS as readonly string[]).includes(area);
}

/** Carrega todas as entradas existentes de uma área. */
export function loadAreaEntries(area: CGLArea): CGLEntry[] {
  const filePath = path.join(CGL_ROOT, `${area}.json`);
  if (!fs.existsSync(filePath)) return [];
  const data = readJSON<AreaFile>(filePath);
  return data.entries;
}

/** Carrega todas as propostas pendentes. */
export function loadPending(): ResearchEntry[] {
  if (!fs.existsSync(PENDING_PATH)) return [];
  const data = readJSON<PendingFile>(PENDING_PATH);
  return data.entries;
}

/** Carrega propostas pendentes de uma área específica. */
export function loadPendingForArea(area: CGLArea): ResearchEntry[] {
  return loadPending().filter(e => e.area === area && e.status === 'pending');
}

/** Salva novas propostas no pending_research.json. */
export function savePendingEntries(newEntries: ResearchEntry[]): void {
  const current = loadPending();
  const merged = [...current, ...newEntries];
  writeJSON<PendingFile>(PENDING_PATH, { version: 1, entries: merged });
}

/** Aprova uma entrada pendente: move-a para o arquivo da área e atualiza index.json. */
export function approveEntry(entryId: string): { success: boolean; entry?: ResearchEntry; error?: string } {
  const pending = loadPending();
  const idx = pending.findIndex(e => e.id === entryId && e.status === 'pending');
  if (idx === -1) return { success: false, error: 'Entry não encontrada ou já processada.' };

  const entry = pending[idx]!;
  entry.status = 'approved';

  // Gera o ID definitivo na CGL: prefixo da área + sequencial
  const areaEntries = loadAreaEntries(entry.area);
  const nextNum = areaEntries.length + 1;
  const prefix = entry.area.slice(0, 4);

  const cglEntry: CGLEntry = {
    id: `${prefix}-${String(nextNum).padStart(3, '0')}`,
    concept: entry.concept,
    description: entry.description,
    tags: entry.tags,
    ...(entry.canon_link != null ? { canon_link: entry.canon_link } : {}),
    source: 'kdr',
    added_at: new Date().toISOString(),
  };

  // Grava na área
  const areaPath = path.join(CGL_ROOT, `${entry.area}.json`);
  const areaFile = readJSON<AreaFile>(areaPath);
  areaFile.entries.push(cglEntry);
  writeJSON(areaPath, areaFile);

  // Atualiza index.json
  const indexFile = readJSON<IndexFile>(INDEX_PATH);
  const areaIndex = indexFile.areas.find(a => a.area === entry.area);
  if (areaIndex) areaIndex.entry_count++;
  indexFile.total_entries = indexFile.areas.reduce((sum, a) => sum + a.entry_count, 0);
  indexFile.last_updated = new Date().toISOString();
  writeJSON(INDEX_PATH, indexFile);

  // Persiste status no pending
  writeJSON<PendingFile>(PENDING_PATH, { version: 1, entries: pending });

  console.log(`[CGL Writer] ✅ Entry aprovada: ${cglEntry.id} → ${entry.area}.json`);
  return { success: true, entry };
}

/** Rejeita uma entrada pendente (marca como rejected, preserva para VLS). */
export function rejectEntry(entryId: string): { success: boolean; entry?: ResearchEntry; error?: string } {
  const pending = loadPending();
  const idx = pending.findIndex(e => e.id === entryId && e.status === 'pending');
  if (idx === -1) return { success: false, error: 'Entry não encontrada ou já processada.' };

  const rejected = pending[idx]!;
  rejected.status = 'rejected';
  writeJSON<PendingFile>(PENDING_PATH, { version: 1, entries: pending });

  console.log(`[CGL Writer] ❌ Entry rejeitada: ${entryId} (preservada para VLS)`);
  return { success: true, entry: rejected };
}

/** Calcula overlap de tokens entre uma query e as entries existentes (para cache). */
export function hasOverlappingPending(area: CGLArea, query: string, threshold = 0.7): boolean {
  const STOP_WORDS = new Set(['de', 'do', 'da', 'em', 'a', 'o', 'e', 'que', 'para', 'no', 'na', 'the', 'in', 'of', 'and', 'for']);
  const tokenize = (s: string) =>
    s.toLowerCase().split(/[\s,.:;!?]+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));

  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return false;

  const pendingEntries = loadPendingForArea(area);
  for (const entry of pendingEntries) {
    const entryTokens = new Set(tokenize(entry.research_query));
    if (entryTokens.size === 0) continue;

    let overlap = 0;
    for (const t of queryTokens) {
      if (entryTokens.has(t)) overlap++;
    }
    const score = overlap / queryTokens.size;
    if (score >= threshold) return true;
  }

  return false;
}
