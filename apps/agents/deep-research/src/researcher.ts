/**
 * KDR Researcher — Pesquisa web (Tavily) + LLM → ResearchEntry[].
 *
 * Budget por invocação:
 *   • Máx 1 chamada Tavily (search depth: basic)
 *   • Máx 1 chamada LLM (jsonMode)
 *   • Máx 3 ResearchEntry por resposta
 *
 * Usa KDR_TAVILY_API_KEY (separada do pipeline) para isolamento de billing.
 * Se a key não existir, retorna resultados mock (dev mode).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { OpenAIProvider } from '@cos/llm';
import {
  type CGLArea,
  type ResearchEntry,
  loadAreaEntries,
  hasOverlappingPending,
} from '@cos/cgl-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CANON_PATH = path.resolve(__dirname, '../../../../dna/CANON.md');

const llm = new OpenAIProvider();

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ResearchResult {
  entries: ResearchEntry[];
  tavilyCalls: number;
  llmCalls: number;
  durationMs: number;
  cached: boolean;
}

// ─── CANON loader ───────────────────────────────────────────────────────────

function loadCanonContext(): string {
  try {
    const raw = fs.readFileSync(CANON_PATH, 'utf-8');
    // Trunca a 2000 chars para manter o prompt lean
    return raw.length > 2000 ? raw.slice(0, 2000) + '\n[...]' : raw;
  } catch {
    return '(CANON não disponível)';
  }
}

// ─── Tavily (web search) ────────────────────────────────────────────────────

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

async function searchTavily(query: string): Promise<{ results: TavilyResult[]; answer: string } | null> {
  const apiKey = process.env['KDR_TAVILY_API_KEY'];
  if (!apiKey) {
    console.log('[KDR] KDR_TAVILY_API_KEY não configurada — usando mock.');
    return {
      answer: `Mock: resultados de pesquisa para "${query}"`,
      results: [
        { title: `Mock result for: ${query}`, url: 'https://example.com', content: `This is a mock search result about ${query} for cinematography research.` },
      ],
    };
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `cinematography technique ${query}`,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5,
      }),
    });

    if (!response.ok) {
      console.error(`[KDR] Tavily HTTP ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    return {
      answer: data.answer || '',
      results: (data.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.content || '',
      })),
    };
  } catch (err) {
    console.error('[KDR] Erro Tavily:', err);
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function research(area: CGLArea, query: string): Promise<ResearchResult> {
  const start = Date.now();
  let tavilyCalls = 0;
  let llmCalls = 0;

  // Cache check: se já existe proposta pendente com ≥70% overlap, retorna sem custo
  if (hasOverlappingPending(area, query)) {
    console.log(`[KDR] Cache hit: query "${query}" em ${area} já tem proposta pendente similar.`);
    return { entries: [], tavilyCalls: 0, llmCalls: 0, durationMs: Date.now() - start, cached: true };
  }

  // 1. Busca web via Tavily
  const searchResults = await searchTavily(query);
  tavilyCalls = 1;

  // 2. Carrega contexto local
  const existingEntries = loadAreaEntries(area);
  const existingConcepts = existingEntries.map((e: any) => e.concept).join(', ') || '(nenhuma)';
  const canonContext = loadCanonContext();

  // 3. Prepara prompt para LLM
  const webContext = searchResults
    ? searchResults.results.map(r => `- ${r.title}: ${r.content.slice(0, 300)}`).join('\n')
    : '(sem resultados de busca)';

  const prompt = `Você é o KAIRO Deep Research (KDR), o assistente de pesquisa cinematográfica da marca KAIRO.

CONTEXTO DO CANON KAIRO:
${canonContext}

ÁREA DA CGL: ${area}
CONCEITOS JÁ EXISTENTES NESTA ÁREA: ${existingConcepts}

RESULTADOS DA PESQUISA WEB:
${webContext}

QUERY DO OPERADOR: "${query}"

TAREFA:
Proponha de 1 a 3 entradas para a Cinematic Genome Library (CGL) na área "${area}", baseado nos resultados da pesquisa e alinhado com o Canon KAIRO.

REGRAS:
- Cada entrada deve ser um conceito/técnica cinematográfica útil e aplicável
- NÃO repita conceitos já existentes na área
- Cada tag deve ser uma palavra-chave relevante para busca semântica
- O campo "confidence" vai de 0.0 a 1.0 (quão confiante você está que esta entrada é relevante)
- Apenas proponha entradas com confidence >= 0.6
- O campo "reasoning" explica por que esta entrada é relevante para a KAIRO

Responda APENAS com um JSON no formato:
{
  "entries": [
    {
      "concept": "Nome curto do conceito/técnica",
      "description": "Quando e por que usar esta técnica",
      "tags": ["tag1", "tag2", "tag3"],
      "canon_link": "Seção do CANON relacionada (ou null)",
      "confidence": 0.8,
      "reasoning": "Por que isto é relevante para a KAIRO"
    }
  ]
}`;

  const responseStr = await llm.complete(prompt, { task: 'observer', jsonMode: true, temperature: 0.4 });
  llmCalls = 1;

  let parsed: { entries: Array<{
    concept: string;
    description: string;
    tags: string[];
    canon_link?: string;
    confidence: number;
    reasoning: string;
  }> };

  try {
    parsed = JSON.parse(responseStr);
  } catch {
    console.error('[KDR] Falha ao parsear resposta LLM:', responseStr.slice(0, 200));
    return { entries: [], tavilyCalls, llmCalls, durationMs: Date.now() - start, cached: false };
  }

  // Filtra por confidence e limita a 3
  const validEntries = (parsed.entries || [])
    .filter(e => e.confidence >= 0.6)
    .slice(0, 3);

  const researchEntries: ResearchEntry[] = validEntries.map(e => ({
    id: randomUUID(),
    area,
    concept: e.concept,
    description: e.description,
    tags: e.tags,
    canon_link: e.canon_link || undefined,
    confidence: e.confidence,
    reasoning: e.reasoning,
    source_url: searchResults?.results[0]?.url,
    research_query: query,
    proposed_at: new Date().toISOString(),
    status: 'pending' as const,
  }));

  const elapsed = Date.now() - start;
  console.log(`[KDR] Pesquisa "${query}" (${area}): ${researchEntries.length} propostas, ${tavilyCalls} Tavily, ${llmCalls} LLM, ${elapsed}ms`);

  return { entries: researchEntries, tavilyCalls, llmCalls, durationMs: elapsed, cached: false };
}
