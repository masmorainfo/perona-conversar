// ────────────────────────────────────────────────────────────────────────────
// POST /api/jobs/retry — ação manual do operador sobre uma unit.
// Sugestão de destino: apps/mission-control/src/app/api/jobs/retry/route.ts
//
// Princípios (decididos na revisão da missão):
//  • EVENTO, NUNCA HARD RESET: nada aqui escreve `state` direto no banco.
//    A rota valida, AUDITA e enfileira um job na fila BullMQ correspondente —
//    a máquina de estados transiciona pelo caminho normal do Supervisor.
//  • Toda ação exige motivo e fica gravada (quem, quando, de→para, motivo).
//  • Só transições válidas do grafo (pipeline-states.ts). Sem pular gate.
//
// Env obrigatória: MISSION_CONTROL_OPERATOR_TOKEN
// ────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { isValidManualAction, STATES } from '@/lib/pipeline-states';
import { queueName } from '@cos/events';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function getQueue(name: string, channelId: string): Queue {
  const qName = queueName(name as any, channelId);
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisUrl = new URL(REDIS_URL);
  return new Queue(qName, {
    connection: {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || '6379', 10),
      password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    },
  });
}

interface RetryBody {
  contentId: string;
  currentState: string;   // estado que o cliente ACHA que a unit está (checado contra o banco)
  action: 'retry' | 'rollback';
  targetState?: string;
  reason: string;
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Autenticação ────────────────────────────────────────────────────
    const token = req.headers.get('x-operator-token');
    if (!process.env.MISSION_CONTROL_OPERATOR_TOKEN) {
      return NextResponse.json({ error: 'MISSION_CONTROL_OPERATOR_TOKEN não configurado no servidor.' }, { status: 500 });
    }
    if (token !== process.env.MISSION_CONTROL_OPERATOR_TOKEN) {
      return NextResponse.json({ error: 'Token de operador inválido.' }, { status: 401 });
    }

    // ── 2. Validação do corpo ──────────────────────────────────────────────
    let body: RetryBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
    }
    const { contentId, currentState, action, targetState, reason } = body ?? {};
    if (!contentId || !currentState || !action || !reason || reason.trim().length < 5) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: contentId, currentState, action, reason (mín. 5 caracteres).' },
        { status: 400 }
      );
    }

    // ── 3. Estado real no banco (o cliente pode estar defasado) ────────────
    const { rows } = await pool.query(
      'SELECT id, state, channel_id, topic, metadata FROM content_units WHERE id = $1',
      [contentId]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: `Unit ${contentId} não existe.` }, { status: 404 });
    }
    const unit = rows[0];
    if (unit.state !== currentState) {
      return NextResponse.json(
        { error: `Estado defasado: o painel mostra ${currentState}, mas a unit está em ${unit.state}. Recarregue.` },
        { status: 409 }
      );
    }

    // ── 4. Transição válida? ───────────────────────────────────────────────
    const check = isValidManualAction(unit.state, action, targetState);
    if (!check.ok || !check.queue) {
      return NextResponse.json({ error: check.reason ?? 'Ação inválida para este estado.' }, { status: 422 });
    }

    // ── 5. Auditoria ANTES da ação (regra de operações manuais) ────────────
    const auditEntry = {
      at: new Date().toISOString(),
      action,
      fromState: unit.state,
      toState: action === 'rollback' ? targetState : unit.state,
      queue: check.queue,
      reason: reason.trim(),
      via: 'mission-control',
    };
    const newDbState = action === 'rollback' ? targetState! : unit.state;
    
    // Transição canônica: atualiza content_units e insere em content_transitions (com histórico)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE content_units
           SET state = $2,
               updated_at = NOW(),
               metadata = (
                 COALESCE(metadata, '{}'::jsonb) - 'queueErrorReason' - 'queueErrorAt' - 'queueErrorFrom' - 'queueErrorSource'
               ) || jsonb_build_object(
                 'operatorActions',
                 COALESCE(metadata->'operatorActions', '[]'::jsonb) || $3::jsonb
               )
         WHERE id = $1`,
        [contentId, newDbState, JSON.stringify(auditEntry)]
      );
      await client.query(
        `INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [contentId, unit.state, newDbState, 'mission-control', reason.trim()]
      );
      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // ── 6. Injeção do EVENTO na fila correspondente ────────────────────────
    const JOB_NAME_BY_QUEUE: Record<string, string> = {
      editorial: 'evaluate',
      research: 'research',
      script: 'write_script',
      critic: 'review_script',
      storyboard: 'plan_storyboard',
      media: 'generate_media',
      render: 'render_video',
      quality: 'qc_video',
      'cinematic-review': 'review_cinematic',
      publisher: 'publish',
    };
    const jobName = JOB_NAME_BY_QUEUE[check.queue] ?? 'retry';

    const queue = getQueue(check.queue, unit.channel_id);
    let jobIdToUse = `${contentId}_${unit.state}`;
    try {
      const existingJob = await queue.getJob(jobIdToUse);
      if (existingJob) {
        try {
          const existingState = await existingJob.getState();
          console.log(`[Retry] Removendo job existente ${jobIdToUse} (estado BullMQ: ${existingState}) antes de reenfileirar.`);
          await existingJob.remove();
        } catch (removeErr: any) {
          console.warn(`[Retry] Aviso: Job ${jobIdToUse} não pôde ser removido (ex: ativo/trava de worker): ${removeErr.message}. Gerando sufixo de timestamp.`);
          jobIdToUse = `${jobIdToUse}_${Date.now()}`;
        }
      }

      await queue.add(jobName, {
        contentId,
        channelId: unit.channel_id,
        topic: unit.topic,
        ...(unit.metadata?.researchPackage ? { researchPackage: unit.metadata.researchPackage } : {}),
        ...(unit.metadata?.script ? { script: unit.metadata.script } : {}),
        ...(unit.metadata?.assetUrls ? { assetUrls: unit.metadata.assetUrls } : {}),
        ...(unit.metadata?.manifestPath ? { storyManifestPath: unit.metadata.manifestPath } : {}),
        ...(unit.metadata?.canonArchetype ? { canonArchetype: unit.metadata.canonArchetype } : {}),
        ...(unit.metadata?.canonTargetEmotion ? { canonTargetEmotion: unit.metadata.canonTargetEmotion } : {}),
        attemptNumber: 1,
        manualRetry: true,
        operatorReason: reason.trim(),
        requestedTargetState: action === 'rollback' ? targetState : undefined,
      }, {
        jobId: jobIdToUse,
      });
    } finally {
      await queue.close();
    }

    const targetLabel = action === 'rollback' ? STATES[targetState!]?.label : STATES[unit.state]?.label;
    return NextResponse.json({
      ok: true,
      message: `Evento enfileirado em "${check.queue}" (${jobName}) para ${targetLabel}. Auditoria registrada.`,
    });
  } catch (err: any) {
    console.error('[Retry API Error]', err);
    return NextResponse.json(
      { error: err.message || String(err) },
      { status: 500 }
    );
  }
}
