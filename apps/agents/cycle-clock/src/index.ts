// ============================================================
// @cos/agent-cycle-clock — Relógio Operacional do COS
//
// Responsabilidade única:
//   Iniciar ciclos operacionais autônomos no COS, substituindo
//   a ação humana de enviar um prompt ao operador.
//
// Princípio da Dupla Entrada:
//   Este serviço é a Porta Autônoma. A Porta Manual (CLI /
//   Mission Control) continua existindo e sendo igualmente válida.
//   Ambas convergem para o mesmo pipeline. A única diferença
//   registrada é o campo `origin` em content_units.
//
// O que este serviço FAZ:
//   - A cada CYCLE_INTERVAL_HOURS horas, para cada canal ativo,
//     verificar se existem oportunidades com status 'QUEUED'.
//   - Se existirem, despachar CYCLE_STARTED para a fila pipeline.
//   - Registrar cada ciclo em cycle_clock_log para auditoria.
//
// O que este serviço NÃO FAZ:
//   - Não cria content_units diretamente (papel do Supervisor).
//   - Não decide qual conteúdo produzir (papel do Scheduler).
//   - Não monitora saúde de outros serviços.
//   - Não agenda tarefas futuras além do próximo ciclo.
//   - Não toca em analytics, VLS ou qualquer outro componente.
// ============================================================

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Queue } from 'bullmq';
import pg from 'pg';
import { CronJob } from 'cron';
import { SUPERVISOR_QUEUE } from '@cos/events';
import { sendTelegram } from '@cos/notifications';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// ─── Configuração ──────────────────────────────────────────────────────────────

/**
 * Expressões cronográficas para disparo dos ciclos operacionais.
 * Horários-alvo: 12:20, 18:35, 20:50 (BRT)
 * Antecedência de segurança: -2 horas (10:20, 16:35, 18:50)
 */
const CRON_SCHEDULES = [
  '20 10 * * *', // Disparo para o alvo das 12:20
  '35 16 * * *', // Disparo para o alvo das 18:35
  '50 18 * * *'  // Disparo para o alvo das 20:50
];

const TIMEZONE = 'America/Sao_Paulo';

/**
 * Máximo de oportunidades injetadas por canal por ciclo.
 * Default: 1 — o canal mais promissor é injetado, os demais aguardam o próximo ciclo.
 * Controla o ritmo de produção autônoma.
 */
const MAX_OPPORTUNITIES_PER_CHANNEL = parseInt(
  process.env['CYCLE_MAX_OPPORTUNITIES_PER_CHANNEL'] ?? '1',
  10,
);

/**
 * Timeout de staleness: qualquer content_unit parado em estado não-terminal
 * por mais deste valor em horas é automaticamente movido para ABANDONED.
 *
 * Garante que uma falha silenciosa (agente travado, decisão não tomada)
 * nunca bloqueie o próximo ciclo operacional indefinidamente.
 *
 * Default: 48h. Configurável via STALENESS_THRESHOLD_HOURS.
 */
const STALENESS_THRESHOLD_HOURS = parseInt(
  process.env['STALENESS_THRESHOLD_HOURS'] ?? '48',
  10,
);

// ─── Infraestrutura ────────────────────────────────────────────────────────────

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const redisConnection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
};

const telegramConfig = {
  botToken: process.env['TELEGRAM_BOT_TOKEN'] ?? '',
  chatId: process.env['TELEGRAM_CHAT_ID'] ?? ''
};

const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection: redisConnection });

// ─── Ciclo operacional ─────────────────────────────────────────────────────────

/**
 * Guarda de staleness — roda ANTES de cada ciclo operacional.
 *
 * Abandona automaticamente qualquer content_unit que esteja parado
 * em estado não-terminal por mais de STALENESS_THRESHOLD_HOURS horas.
 *
 * Razão:
 *   Um item travado (agente com bug, decisão editorial não tomada, etc.)
 *   não deve bloquear a produção inteira indefinidamente.
 *   A decisão de publicar ou rejeitar pertence ao editor — mas se ele
 *   não agiu em 48h, o item é tratado como não aprovado por omissão.
 */
async function runStalenessGuard(): Promise<void> {
  const TERMINAL_STATES = [
    'PUBLISHED',
    'PUBLISHED_PARTIAL',
    'ANALYZED',
    'LEARNED',
    'REJECTED',
    'ABANDONED',
    'DEFERRED',
    'FAILED_QA',
  ];

  const terminalList = TERMINAL_STATES.map((_, i) => `$${i + 1}`).join(', ');

  const { rows: staleUnits } = await pool.query<{ id: string; state: string; topic: string; age_hours: string }>(
    `SELECT cu.id, cu.state, cu.topic, cr.slug as channel,
            EXTRACT(EPOCH FROM (NOW() - cu.updated_at)) / 3600 as age_hours
     FROM content_units cu
     LEFT JOIN channel_registry cr ON cu.channel_id = cr.id
     WHERE cu.state NOT IN (${terminalList})
     AND cu.updated_at < NOW() - INTERVAL '${STALENESS_THRESHOLD_HOURS} hours'`,
    TERMINAL_STATES
  );

  if (staleUnits.length === 0) {
    console.log(`[Cycle Clock] [StalenessGuard] Nenhuma unidade estagnada encontrada.`);
    return;
  }

  console.log(`[Cycle Clock] [StalenessGuard] ⚠️ ${staleUnits.length} unidade(s) estagnadas (>${STALENESS_THRESHOLD_HOURS}h). Abandonando automaticamente...`);

  const staleIds = staleUnits.map(u => u.id);
  const idPlaceholders = staleIds.map((_, i) => `$${i + 1}`).join(', ');

  const { rowCount } = await pool.query(
    `UPDATE content_units
     SET state = 'ABANDONED',
         updated_at = NOW(),
         metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{abandonReason}',
           '"timeout - sem decisao editorial ou falha de agente em >${STALENESS_THRESHOLD_HOURS}h"'::jsonb
         )
     WHERE id IN (${idPlaceholders})
     AND state != 'ABANDONED'`,
    staleIds
  );

  for (const unit of staleUnits) {
    const ageH = parseFloat(unit.age_hours).toFixed(1);
    console.log(
      `[Cycle Clock] [StalenessGuard]   → ABANDONED: [${unit.state}] "${unit.topic}" (${ageH}h sem atualização)`
    );
  }

  console.log(`[Cycle Clock] [StalenessGuard] ✓ ${rowCount ?? 0} unidade(s) abandonadas automaticamente.`);
}

interface CycleResult {
  channelsEvaluated: number;
  channelsTriggered: number;
  opportunitiesQueued: number;
  channelDetails: Record<string, { opportunitiesFound: number; triggered: boolean }>;
}

/**
 * Executa um ciclo operacional completo.
 *
 * Para cada canal ativo, verifica oportunidades QUEUED e, se encontrar,
 * despacha CYCLE_STARTED para o Supervisor iniciar o pipeline.
 *
 * O Supervisor é o único responsável por criar o content_unit
 * e disparar EVALUATE_TRIGGER — o Cycle Clock apenas sinaliza
 * que existe trabalho disponível.
 */
async function runCycle(reason: 'scheduled' | 'startup'): Promise<CycleResult> {
  console.log(`\n[Cycle Clock] ─── Iniciando ciclo (${reason}) ───`);

  // Guarda de staleness: limpa unidades travadas antes de avaliar oportunidades
  await runStalenessGuard();

  const result: CycleResult = {
    channelsEvaluated: 0,
    channelsTriggered: 0,
    opportunitiesQueued: 0,
    channelDetails: {},
  };

  // Busca canais ativos ordenados por prioridade
  const { rows: channels } = await pool.query<{
    id: string;
    slug: string;
    name: string;
    priority: string;
  }>(`
    SELECT id, slug, name, priority
    FROM channel_registry
    WHERE is_active = true
    ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
      updated_at ASC
  `);

  if (channels.length === 0) {
    console.log('[Cycle Clock] Nenhum canal ativo encontrado. Ciclo encerrado.');
    await logCycle(result, reason);
    return result;
  }

  console.log(`[Cycle Clock] ${channels.length} canal(is) ativo(s) encontrado(s).`);
  result.channelsEvaluated = channels.length;

  for (const channel of channels) {
    const channelLog = { opportunitiesFound: 0, triggered: false };
    result.channelDetails[channel.slug] = channelLog;

    // --- PROTEÇÃO DE CONCORRÊNCIA ---
    // Verifica se o canal já possui um conteúdo em processo de produção.
    //
    // Estados TERMINAIS (não bloqueiam o próximo ciclo):
    //   PUBLISHED, PUBLISHED_PARTIAL — ciclo completo, sucesso
    //   ANALYZED, LEARNED            — pós-publicação, aprendizado
    //   REJECTED                     — rejeitado pelo editor
    //   ABANDONED                    — descartado operacionalmente
    //   DEFERRED                     — adiado explicitamente
    //   FAILED_QA                    — falha na assinatura editorial;
    //                                  este item específico não vingou,
    //                                  mas a esteira está LIVRE para novo ciclo.
    const TERMINAL_STATES = [
      'PUBLISHED',
      'PUBLISHED_PARTIAL',
      'ANALYZED',
      'LEARNED',
      'REJECTED',
      'ABANDONED',
      'DEFERRED',
      'FAILED_QA',  // ← estado terminal: falha editorial, não falha de infra
    ];

    const terminalList = TERMINAL_STATES.map((_, i) => `$${i + 2}`).join(', ');
    const { rows: activeUnits } = await pool.query<{ id: string; state: string }>(
      `SELECT id, state 
       FROM content_units 
       WHERE channel_id = $1 
       AND state NOT IN (${terminalList})
       LIMIT 1`,
      [channel.id, ...TERMINAL_STATES]
    );

    if (activeUnits.length > 0) {
      console.log(
        `[Cycle Clock]   ${channel.slug}: Produção ocupada (Conteúdo ${activeUnits[0]?.id} no estado ${activeUnits[0]?.state}). Ignorando.`
      );
      
      if (telegramConfig.botToken && telegramConfig.chatId) {
        const timeNow = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE });
        const skipMessage = `⏭️ Horário das ${timeNow} pulado — vídeo anterior do canal *${channel.slug}* ainda em processamento (estado: \`${activeUnits[0]?.state}\`).`;
        /* await sendTelegram(skipMessage, telegramConfig, 'Markdown').catch((err: unknown) => {
          console.warn('[Cycle Clock] Falha ao notify Telegram sobre o skip:', err);
        }); */
      }

      continue;
    }

    // Busca oportunidades QUEUED para este canal, ordenadas por score descendente
    const { rows: opportunities } = await pool.query<{
      id: string;
      title: string;
      dynamic_score: number;
    }>(
      `SELECT id, title, dynamic_score
       FROM content_opportunities
       WHERE channel_id = $1 AND status = 'QUEUED'
       ORDER BY dynamic_score DESC NULLS LAST, updated_at ASC
       LIMIT $2`,
      [channel.id, MAX_OPPORTUNITIES_PER_CHANNEL],
    );

    channelLog.opportunitiesFound = opportunities.length;

    if (opportunities.length === 0) {
      console.log(
        `[Cycle Clock]   ${channel.slug}: nenhuma oportunidade QUEUED disponível. Aguardando.`,
      );
      continue;
    }

    // Despacha cada oportunidade encontrada (até MAX_OPPORTUNITIES_PER_CHANNEL)
    for (const opp of opportunities) {
      console.log(
        `[Cycle Clock]   ${channel.slug}: disparando CYCLE_STARTED → "${opp.title}" (score: ${opp.dynamic_score?.toFixed(2) ?? 'n/a'})`,
      );

      await supervisorQueue.add('CYCLE_STARTED', {
        channelId: channel.id,
        channelSlug: channel.slug,
        opportunityId: opp.id,
        topic: opp.title,
        origin: 'cycle-clock' as const,
        cycleReason: reason,
        triggeredAt: new Date().toISOString(),
      });

      result.opportunitiesQueued++;
    }

    channelLog.triggered = true;
    result.channelsTriggered++;
  }

  await logCycle(result, reason);

  console.log(
    `[Cycle Clock] ─── Ciclo concluído: ${result.channelsTriggered}/${result.channelsEvaluated} canais disparados, ${result.opportunitiesQueued} oportunidade(s) enfileirada(s) ───\n`,
  );

  return result;
}

/**
 * Registra o resultado do ciclo na tabela cycle_clock_log.
 * Falha silenciosa — problema de log não deve parar o ciclo operacional.
 */
async function logCycle(result: CycleResult, reason: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO cycle_clock_log
         (channels_evaluated, channels_triggered, opportunities_queued, reason, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        result.channelsEvaluated,
        result.channelsTriggered,
        result.opportunitiesQueued,
        reason,
        JSON.stringify(result.channelDetails),
      ],
    );
  } catch (err) {
    // Log de auditoria nunca deve parar o ciclo operacional
    console.warn('[Cycle Clock] Aviso: falha ao gravar cycle_clock_log:', err);
  }
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         COS — Cycle Clock iniciando...          ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Cron Schedules: ${CRON_SCHEDULES.join(', ')} (${TIMEZONE})`);
  console.log(`  Máx. oportunidades por canal por ciclo: ${MAX_OPPORTUNITIES_PER_CHANNEL}`);
  console.log(`  Supervisor Queue: ${SUPERVISOR_QUEUE}`);
  console.log('');

  // Valida conectividade antes de iniciar
  try {
    await pool.query('SELECT 1');
    console.log('[Cycle Clock] ✓ PostgreSQL conectado');
  } catch (err) {
    console.error('[Cycle Clock] ✗ Falha ao conectar ao PostgreSQL:', err);
    process.exit(1);
  }

  // Executa o primeiro ciclo imediatamente ao iniciar
  await runCycle('startup');

  // Agenda ciclos recorrentes
  for (const schedule of CRON_SCHEDULES) {
    const job = new CronJob(
      schedule,
      () => {
        console.log(`\n[Cycle Clock] Disparo cronômétrico acionado: ${schedule}`);
        runCycle('scheduled').catch(err => {
          console.error('[Cycle Clock] Erro no ciclo agendado:', err);
        });
      },
      null,
      true,
      TIMEZONE
    );
    console.log(`[Cycle Clock] ✓ Cron job agendado: ${schedule} (${TIMEZONE})`);
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Cycle Clock] Recebido ${signal}. Encerrando graciosamente...`);
    await Promise.all([pool.end(), supervisorQueue.close()]);
    console.log('[Cycle Clock] Encerrado.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch(err => {
  console.error('[Cycle Clock] Erro crítico no bootstrap:', err);
  process.exit(1);
});
