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
import { SUPERVISOR_QUEUE } from '@cos/events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// ─── Configuração ──────────────────────────────────────────────────────────────

/**
 * Intervalo entre ciclos em horas.
 * Default: 6 horas — ajustável via variável de ambiente.
 */
const CYCLE_INTERVAL_HOURS = parseFloat(process.env['CYCLE_INTERVAL_HOURS'] ?? '6');
const CYCLE_INTERVAL_MS = CYCLE_INTERVAL_HOURS * 60 * 60 * 1000;

/**
 * Máximo de oportunidades injetadas por canal por ciclo.
 * Default: 1 — o canal mais promissor é injetado, os demais aguardam o próximo ciclo.
 * Controla o ritmo de produção autônoma.
 */
const MAX_OPPORTUNITIES_PER_CHANNEL = parseInt(
  process.env['CYCLE_MAX_OPPORTUNITIES_PER_CHANNEL'] ?? '1',
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

const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection: redisConnection });

// ─── Ciclo operacional ─────────────────────────────────────────────────────────

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
  console.log(`  Intervalo: ${CYCLE_INTERVAL_HOURS}h`);
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
  setInterval(() => {
    runCycle('scheduled').catch(err => {
      console.error('[Cycle Clock] Erro no ciclo agendado:', err);
    });
  }, CYCLE_INTERVAL_MS);

  console.log(`[Cycle Clock] ✓ Próximo ciclo em ${CYCLE_INTERVAL_HOURS}h`);

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
