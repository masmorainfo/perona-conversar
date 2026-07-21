import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, EditorialJobData, EditorialResultData } from '@cos/events';
import { OpenAIProvider } from '@cos/llm';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Supervisor queue for sending results back
const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

async function processEditorialJob(job: Job<EditorialJobData>) {
  const { contentId, channelId, topic, trendSignal, opportunityId } = job.data;
  console.log(`[Editorial Intelligence] Avaliando tópico/oportunidade: "${topic}" para canal: ${channelId}`);

  // Fetch ChannelCore from registry
  const res = await pool.query('SELECT core FROM channel_registry WHERE id = $1', [channelId]);
  if (res.rowCount === 0) {
    throw new Error(`Channel ${channelId} not found`);
  }
  const channelCore = res.rows[0].core;

  // Enrich context if opportunityId is available
  let opportunityContext = '';
  if (opportunityId) {
    const oppRes = await pool.query('SELECT description, source_signals FROM content_opportunities WHERE id = $1', [opportunityId]);
    if ((oppRes.rowCount ?? 0) > 0) {
      opportunityContext = `
      Descrição da Oportunidade: "${oppRes.rows[0].description}"
      Sinais de Origem: ${JSON.stringify(oppRes.rows[0].source_signals)}
      `;
    }
  }

  const prompt = `
    Você é a Inteligência Editorial (Diretor de Conteúdo) do canal "${channelCore.name}".
    A missão do canal é: "${channelCore.mission}".
    O público alvo foca em: ${channelCore.audience?.interests?.join(', ')}.
    Limites editoriais (ALWAYS IN): ${channelCore.editorial_limits?.always_in?.join(', ')}.
    Limites editoriais (ALWAYS OUT): ${channelCore.editorial_limits?.always_out?.join(', ')}.
    
    Analise o seguinte tópico proposto para um vídeo: "${topic}"
    ${opportunityContext}
    ${trendSignal ? `Sinal de trend isolado: ${JSON.stringify(trendSignal)}` : ''}
    
    ── FILTRO DO CANON KAIRO ────────────────────────────────────────────────────
    Antes de qualquer decisão editorial, classifique este tópico em um dos
    cinco Arquétipos Narrativos do Canon KAIRO:
    
    1. "heroi_tragico"       — Culpa + Grandeza. Jogador que falhou no momento decisivo
                               e carrega esse peso. Ex: Baggio, Roberto Carlos (Copa 98).
    2. "exilado_que_retorna" — Redenção + Melancolia. Atleta que voltou após exílio,
                               lesão grave ou exclusão injusta.
    3. "eterno_segundo"      — Injustiça + Dignidade. O melhor de uma geração que nunca
                               venceu o que merecia. Ex: Geração Belga, Mané Garrincha.
    4. "martir_esquecido"    — Solidão + Legado. Craque que foi eclipsado, esquecido
                               ou nunca recebeu o reconhecimento que merecia.
    5. "momento_impossivel"  — Espanto + Êxtase. Um feito estatisticamente ou
                               historicamente improvável que desafia a crença.
    
    Pergunta central do Canon: "O que esse momento revela sobre a condição humana?"
    
    Se o tópico NÃO mapear para nenhum dos 5 arquétipos (ex: é apenas um resultado
    de partida, uma polêmica de comentarista, ou um highlights genérico), o campo
    "canonArchetype" deve ser null e "approved" deve ser false, pois a KAIRO não
    produz conteúdo sem profundidade humana arquetípica.
    ─────────────────────────────────────────────────────────────────────────────

    ── CLP (Content Localization Policy) ───────────────────────────────────────
    O COS é um sistema de LOCALIZAÇÃO, não de tradução.
    Se o tópico ou sinais contiverem termos em outros idiomas, avalie:
    • O termo localizado comunica claramente para o público brasileiro?
    • Se NÃO, inclua "clpOverrides" com a correção editorial.
    Estratégias disponíveis: KEEP | TRANSLATE | ADAPT | EXPLAIN | REMOVE
    ─────────────────────────────────────────────────────────────────────────────

    ASSUMA QUE O EVENTO OU TEMA É REAL E CONFIRMADO. Sua função não é verificar fatos, mas julgar estritamente a qualidade da história. Avalie o tema apenas por sua adequação ao CANON KAIRO e à exploração da condição humana. Deixe a verificação factual para a próxima etapa do pipeline.

    
    Responda APENAS com um objeto JSON válido:
    {
      "approved": boolean,
      "score": number (0 a 1),
      "canonArchetype": "heroi_tragico" | "exilado_que_retorna" | "eterno_segundo" | "martir_esquecido" | "momento_impossivel" | null,
      "canonTargetEmotion": "string com a emoção central identificada (ex: 'Culpa + Grandeza') ou null",
      "direction": "string com a direção editorial ou ângulo sugerido se aprovado",
      "reason": "string explicando detalhadamente o porquê da decisão baseada na missão, limites E no Filtro do Canon",
      "clpOverrides": [
        {
          "originalTerm": "termo original",
          "strategy": "KEEP|TRANSLATE|ADAPT|EXPLAIN|REMOVE",
          "localizedForm": "forma localizada corrigida",
          "reason": "justificativa editorial"
        }
      ]
    }
  `;

  const responseJsonStr = await llm.complete(prompt, { task: 'editorial', jsonMode: true, temperature: 0.2 });
  const result = JSON.parse(responseJsonStr);

  // Log Canon classification for observability
  if (result.canonArchetype) {
    console.log(`[Editorial Intelligence] Canon: "${topic}" → Arquétipo: ${result.canonArchetype} (${result.canonTargetEmotion})`);
  } else {
    console.log(`[Editorial Intelligence] Canon: "${topic}" → Sem arquétipo. Rejeitado pelo Filtro do Canon.`);
  }

  const resultData: EditorialResultData = {
    contentId,
    channelId,
    approved: result.approved,
    score: result.score,
    direction: result.direction,
    reason: result.reason,
    canonArchetype: result.canonArchetype ?? undefined,
    canonTargetEmotion: result.canonTargetEmotion ?? undefined,
    clpOverrides: result.clpOverrides || [],
  };

  // Update opportunity status if applicable
  if (opportunityId) {
    const newStatus = result.approved ? 'APPROVED' : 'REJECTED';
    await pool.query(
      'UPDATE content_opportunities SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, opportunityId]
    );
    console.log(`[Editorial Intelligence] Status da Oportunidade ${opportunityId} atualizado para ${newStatus}`);
  }

  // Send back to supervisor
  await supervisorQueue.add('EDITORIAL_RESULT', resultData);
  console.log(`[Editorial Intelligence] Tópico "${topic}" -> Aprovado: ${result.approved} (Score: ${result.score})`);
}

async function bootstrap() {
  console.log('🚀 Iniciando Editorial Intelligence Agent...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  
  if (channelIds.length === 0) {
    // Fallback if DB is empty during startup
    channelIds.push('tech-br-001');
  }

  for (const channelId of channelIds) {
    const qName = queueName('editorial', channelId);
    const worker = new Worker(qName, processEditorialJob, { connection, concurrency: 2, lockDuration: 3 * 60 * 1000, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } });
    
    worker.on('ready', () => {
      console.log(`✅ Ouve fila editorial para o canal: ${channelId}`);
    });
    worker.on('error', err => {
      console.error(`🚨 Erro no worker ${qName}:`, err);
    });
  }
}

bootstrap().catch(console.error);

