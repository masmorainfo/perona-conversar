import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, ScriptJobData, ScriptResultData } from '@cos/events';
import { OpenAIProvider } from '@cos/llm';
import type { Script, ScriptSection } from '@cos/types';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

// ─── Anti-CTA Guard ───────────────────────────────────────────────────────────
// Canon: "KAIRO não pede, KAIRO entrega."
// Detecta frases de call-to-action explícitas por regex, sem custo de LLM.
// Cobre PT-BR (primário) e EN (fallback). Case-insensitive.
const CTA_PATTERNS: RegExp[] = [
  // Pedidos de like / curtida
  /d[eê]\s*(um|um)\s*like/i,
  /cur[ta]+/i,
  /aperta\s*o\s*(like|curtir)/i,
  // Pedidos de compartilhamento
  /compartilh[ea]/i,
  /manda\s*(pra|para)\s*(os\s*amigos|galera|alguém)/i,
  // Pedidos de inscrição / seguir
  /se\s*inscreva/i,
  /inscri[çc][aã]o/i,
  /seguir?\s*(o\s*canal|a\s*p[aá]gina|@)/i,
  /siga\s*(o\s*canal|a\s*conta|@)/i,
  /ativa.*sin[oa]/i,
  // Pedidos de comentário
  /coment[ae]/i,
  /escreve\s*(nos\s*coment[aá]rios|aqui\s*embaixo)/i,
  /deixa\s*(nos\s*coment[aá]rios|a\s*sua\s*opini)/i,
  // Pedidos de salvar / favoritar
  /salva\s*(esse|este|o)\s*v[íi]deo/i,
  /adiciona\s*aos\s*(favoritos|salvos)/i,
  // CTAs de notificação
  /ativa.*notifica[çc][oõ]/i,
  /clica\s*no\s*sininho/i,
  // Padrões em inglês (fallback)
  /like\s*(this|the)\s*video/i,
  /subscribe/i,
  /hit\s*the\s*(bell|like)/i,
  /leave\s*a\s*comment/i,
  /share\s*this\s*video/i,
];

/**
 * Varre todas as seções do roteiro em busca de CTAs proibidos.
 * Lança um erro descritivo se detectar qualquer violação.
 * O Critic Agent captura esse erro e aciona retentativa automática.
 */
function assertNoCTA(script: Script, context: string = 'unknown'): void {
  const candidates: { field: string; text: string }[] = [
    { field: 'hook', text: script.hook },
    { field: 'cta',  text: script.cta  },
    ...script.body.map((s, i) => ({ field: `body[${i}]`, text: s.content })),
  ];

  for (const { field, text } of candidates) {
    for (const pattern of CTA_PATTERNS) {
      if (pattern.test(text)) {
        throw new Error(
          `[Anti-CTA] Violação do Canon em '${field}' (tentativa: ${context}): ` +
          `padrão "${pattern}" detectado. ` +
          `Texto: "${text.slice(0, 120)}..."`
        );
      }
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { Pool } = pg;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

const llm = new OpenAIProvider();
const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

// ─── Humanizer PT-BR ──────────────────────────────────────────────────────────
/**
 * Reformula um roteiro em voz humana, coloquial e autêntica em PT-BR.
 * Elimina marcas de texto gerado por IA (frases clichê, estrutura robótica)
 * e alinha o tom ao persona do canal.
 *
 * @param script - Roteiro gerado pelo LLM
 * @param channelCore - Dados do canal (persona.archetype, persona.tone)
 * @returns Roteiro humanizado
 */
async function humanizerPass(script: Script, channelCore: any): Promise<Script> {
  const archetype = channelCore.persona?.archetype || 'Especialista';
  const tone = channelCore.persona?.tone || 'Direto e informativo';
  const channelName = channelCore.name || 'Canal';

  // Concatenar todas as seções para humanizar em uma única chamada (economiza tokens)
  const sectionsText = script.body.map((s, i) =>
    `[SEÇÃO ${i + 1}]\n${s.content}`
  ).join('\n\n');

  const prompt = `Você é o Humanizador de Roteiros do canal "${channelName}".

Seu trabalho é transformar um roteiro gerado por IA em um texto que soe 100% humano, espontâneo e autêntico em Português do Brasil.

Perfil do apresentador do canal:
- Arquétipo: ${archetype}
- Tom: ${tone}

Regras OBRIGATÓRIAS:
1. Elimine frases clichê de IA: "Neste vídeo...", "Como mencionado anteriormente...", "Em conclusão..."
2. Use contrações naturais do PT-BR: "tá", "né", "cara", "gente" (se o tom permitir)
3. Varie o ritmo — misture frases curtas com longas
4. Mantenha o significado e os fatos — apenas reformule a forma
5. Preserve o gancho (hook) impactante
6. CANON OBRIGATÓRIO: "KAIRO não pede, KAIRO entrega." — NUNCA inclua pedidos de like, compartilhamento, inscrição, comentário ou qualquer call-to-action explícito. O fechamento deve ser uma reflexão final ou uma pergunta retórica, nunca um comando ao espectador.
7. Mantenha o comprimento aproximado de cada seção

Resposta APENAS em JSON:
{
  "hook": "hook humanizado",
  "sections": ["seção 1 humanizada", "seção 2 humanizada", ...],
  "cta": "cta humanizado"
}

Roteiro original:
HOOK: ${script.hook}

${sectionsText}

CTA: ${script.cta}`;

  try {
    const responseJson = await llm.complete(prompt, { task: 'humanizer', jsonMode: true, temperature: 0.75 });
    const humanized = JSON.parse(responseJson);

    return {
      ...script,
      hook: humanized.hook || script.hook,
      cta: humanized.cta || script.cta,
      body: script.body.map((section, i) => ({
        ...section,
        content: (humanized.sections?.[i]) || section.content,
      })),
    };
  } catch (err) {
    console.error('[Script Agent] Falha no Humanizer, usando roteiro original:', err);
    return script; // Fallback seguro — retorna roteiro sem humanização
  }
}

async function processScriptJob(job: Job<ScriptJobData>) {
  const { contentId, channelId, researchPackage, previousScript, criticFeedback, attemptNumber } = job.data;
  console.log(`[Script Agent] Escrevendo script para: "${researchPackage.topic}" (Tentativa: ${attemptNumber})`);

  // Fetch ChannelCore from registry
  const res = await pool.query('SELECT core FROM channel_registry WHERE id = $1', [channelId]);
  if (res.rowCount === 0) {
    throw new Error(`Channel ${channelId} not found`);
  }
  const channelCore = res.rows[0].core;

  let prompt = `
    Você é o Roteirista do canal "${channelCore.name}".
    Tom e Arquétipo: ${channelCore.persona?.archetype} / ${channelCore.persona?.tone}
    Missão: "${channelCore.mission}"
    Público Alvo: ${channelCore.audience?.interests?.join(', ')}
    Palavras proibidas: ${channelCore.persona?.forbiddenWords?.join(', ')}
    
    Crie um roteiro de vídeo atraente com base na seguinte pesquisa:
    TÓPICO OBRIGATÓRIO (o vídeo DEVE ser sobre este tema): "${researchPackage.topic}"
    Resumo da pesquisa: ${JSON.stringify(researchPackage.summary)}
    Fatos principais: ${researchPackage.keyFacts?.join(' | ')}
  `;

  if (previousScript && criticFeedback) {
    prompt += `
    ATENÇÃO: Esta é a tentativa ${attemptNumber}. O Critic Agent rejeitou a versão anterior com os seguintes motivos:
    Problemas bloqueantes: ${criticFeedback.blockingIssues?.join(', ')}
    Sugestões de melhoria:
    ${criticFeedback.suggestions?.map((s: any) => `- Posição ${s.position}: ${s.issue} -> ${s.recommendation}`).join('\n')}
    `;
  }

  prompt += `
    Responda APENAS com um objeto JSON válido neste formato:
    {
      "title": "Título sugerido para o vídeo",
      "hook": "Abertura que prende a atenção nos primeiros 15s",
      "body": [
        { "content": "texto da seção 1", "durationSeconds": 30, "visualNote": "ideia visual 1" },
        { "content": "texto da seção 2", "durationSeconds": 45, "visualNote": "ideia visual 2" }
      ],
      "cta": "Reflexão final ou pergunta retórica — NUNCA um pedido de like, inscrição, compartilhamento ou comentário (Canon: KAIRO não pede, KAIRO entrega)",
      "estimatedDurationSeconds": 90,
      "keywords": ["exatamente 4 hashtags relevantes para o TikTok, sem o caractere #, ex: futebol, copa, baggio, kairo"]
    }
    
    REGRA INVIOLÁVEL — CANON: "KAIRO não pede, KAIRO entrega."
    Jamais inclua no roteiro (hook, body ou cta) qualquer variante de:
    - "curta", "dê um like", "aperta o like"
    - "compartilhe", "manda pra galera"
    - "se inscreva", "siga o canal", "ativa o sininho"
    - "comente", "deixa nos comentários"
    O fechamento do vídeo deve ser uma reflexão, uma pergunta retórica ou uma frase de impacto — nunca um comando ao espectador.
  `;

  const responseJsonStr = await llm.complete(prompt, { task: 'script', jsonMode: true, temperature: 0.7 });
  const result = JSON.parse(responseJsonStr);

  // Normalize sections
  const sections: ScriptSection[] = result.body.map((b: any) => ({
    id: uuidv4(),
    content: b.content,
    durationSeconds: b.durationSeconds,
    visualNote: b.visualNote
  }));

  let script: Script = {
    title: result.title,
    hook: result.hook,
    body: sections,
    cta: result.cta,
    estimatedDurationSeconds: result.estimatedDurationSeconds || sections.reduce((acc, s) => acc + s.durationSeconds, 0),
    keywords: result.keywords || [],
    generatedAt: new Date(),
    version: attemptNumber,
  };

  // ─── Anti-CTA Guard (pré-humanizer) ───────────────────────────────────────
  // Rejeita o roteiro imediatamente se o LLM violou o Canon — sem custo extra.
  // O Worker do BullMQ captura o erro e aciona retentativa automática.
  assertNoCTA(script, `tentativa-${attemptNumber}`);
  console.log(`[Script Agent] ✅ Anti-CTA: roteiro aprovado (nenhuma violação detectada).`);

  // ─── Humanizer Pass ────────────────────────────────────────────────────────
  // Reformula o roteiro em voz humana PT-BR antes de enviar para aprovação
  console.log(`[Script Agent] 🎙️ Aplicando Humanizer PT-BR ao roteiro...`);
  script = await humanizerPass(script, channelCore);
  console.log(`[Script Agent] ✅ Humanizer concluído.`);

  const resultData: ScriptResultData = {
    contentId,
    channelId,
    script,
  };

  await supervisorQueue.add('SCRIPT_RESULT', resultData);
  console.log(`[Script Agent] Roteiro "${script.title}" gerado com sucesso.`);
}

async function bootstrap() {
  console.log('🚀 Iniciando Script Agent...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('script', channelId);
    const worker = new Worker(qName, processScriptJob, { connection, concurrency: 2 });
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
