import type { Pool } from 'pg';
import { Queue } from 'bullmq';
import { contentMachine } from '@cos/state-machine';
import type { ContentMachineContext, ContentMachineEvent } from '@cos/state-machine';
import type { ContentState } from '@cos/types';
import { getContentState, persistTransition } from './db.js';
import { queueName } from '@cos/events';
import { createActor } from 'xstate';
import { notify, editTelegramMessage, editTelegramCaption } from '@cos/notifications';
import path from 'path';
import fs from 'fs';

// Map of outgoing queues used to dispatch next steps
const queues = new Map<string, Queue>();

function getQueue(queueType: string, channelId: string): Queue {
  const name = queueName(queueType as any, channelId);
  if (!queues.has(name)) {
    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisUrl = new URL(REDIS_URL);
    queues.set(name, new Queue(name, {
      connection: {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
        password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
      },
    }));
  }
  return queues.get(name)!;
}

export async function processEvent(
  pool: any,
  jobType: string,
  jobData: any
): Promise<void> {
  const { contentId, channelId } = jobData;
  if (!contentId || !channelId) {
    throw new Error('Missing contentId or channelId in event payload');
  }

  const currentDbState = await getContentState(pool, contentId);
  if (!currentDbState) {
    throw new Error(`Content ${contentId} not found`);
  }

  // Resolve dynamic channel slug from DB to prevent defaulting to 'geral' in notifications
  const chanRes = await pool.query('SELECT slug FROM channel_registry WHERE id = $1', [channelId]);
  const channelSlug = chanRes.rows[0]?.slug ?? 'geral';

  // Restore the machine state from the DB
  const context: ContentMachineContext = {
    contentId,
    channelId,
    topic: currentDbState.topic || 'Unknown Topic',
    metadata: currentDbState.metadata,
    attemptCounts: currentDbState.attemptCounts,
  };

  const actor = contentMachine.provide({
    // any mock dependencies if needed
  });
  
  // We recreate the state object. In XState v5 this can be done via createActor with snapshot.
  // For simplicity, since our machine just accumulates context, we can just start it and send the event.
  // Real implementation for restoring state in XState v5 requires passing state snapshot.
  // Here we'll manually transition the state using machine.transition (or start an actor with state).
  
  // Create an event object from jobData
  let event = mapJobToEvent(jobType, jobData);
  if (jobType === 'PUBLISH_RESULT') {
    try {
      const chanRes = await pool.query('SELECT strategy FROM channel_registry WHERE id = $1', [channelId]);
      const strategy = chanRes.rows[0]?.strategy || {};
      const platformWeights = strategy.platformWeights || { youtube: 1 };
      let targetPlatforms = Object.keys(platformWeights).filter(p => platformWeights[p] > 0);
      if (targetPlatforms.length === 0) {
        targetPlatforms = ['youtube'];
      }

      const logRes = await pool.query(
        'SELECT platform, status, platform_url FROM publication_log WHERE content_id = $1 AND attempt = $2',
        [contentId, jobData.attemptNumber]
      );
      
      const loggedPlatforms = logRes.rows.map((r: any) => r.platform);
      const allFinished = targetPlatforms.every(p => loggedPlatforms.includes(p));
      
      if (!allFinished) {
        console.log(`[Supervisor] Publication partial: completed platforms [${loggedPlatforms.join(', ')}] of expected [${targetPlatforms.join(', ')}]. Waiting...`);
        return; // Do NOT transition yet!
      }
      
      // All expected platforms finished! Build final consolidated results list.
      const results = logRes.rows.map((r: any) => ({
        platform: r.platform,
        success: r.status === 'success',
        platformUrl: r.platform_url,
        error: r.error_message,
      }));
      
      const anySuccess = results.some((r: any) => r.success);
      const allFailed  = results.every((r: any) => !r.success);
      
      if (allFailed) {
        // ⚠️ Todos os uploads falharam — não transicionar para PUBLISHED.
        // Logamos o erro detalhado e retornamos sem emitir evento.
        // O item permanece em READY_TO_PUBLISH para possível retry manual.
        const errors = results.map((r: any) => `${r.platform}: ${r.error || 'unknown'}`).join(' | ');
        console.error(`[Supervisor] ❌ Todos os uploads falharam para ${contentId}. Erros: ${errors}`);
        console.error(`[Supervisor] ⚠️  Item permanece em READY_TO_PUBLISH para retry. Use o painel para retentar.`);
        // Notificar operador no Telegram sobre a falha real
        notify('TEST', {
          message: `❌ *Publicação falhou* em todas as plataformas para \`${contentId.slice(0, 8)}\`.\n\n${errors}\n\nItem permanece em READY_TO_PUBLISH — aguardando retry.`,
        } as any).catch(() => {});
        return; // Não emitir PUBLISH_COMPLETE
      }
      
      if (anySuccess && !allFailed) {
        // Publicação parcial — pelo menos uma plataforma teve sucesso
        event = { type: 'PUBLISH_COMPLETE', results };
      } else {
        event = { type: 'PUBLISH_COMPLETE', results };
      }
    } catch (err) {
      console.error('[Supervisor] Error checking publication status:', err);
      return;
    }
  }

  if (!event) {
    console.warn(`[Supervisor] Unknown jobType: ${jobType} or event mapping failed. Ignoring.`);
    return;
  }

  // We resolve the next state directly (pure function)
  // XState v5: machine.resolveState({ value: currentDbState.state, context }) is possible.
  // For simplicity without delving into XState v5 snapshot internals, we create an actor.
  const machineActor = createActor(contentMachine, {
    snapshot: {
      status: 'active',
      value: currentDbState.state,
      context,
      historyValue: {},
      children: {}
    } as any, // Cast to any to bypass strict XState snapshot typing for now
    input: context
  });
  
  machineActor.start();
  machineActor.send(event);
  
  const newState = machineActor.getSnapshot();
  const nextStateValue = (typeof newState.value === 'string'
    ? newState.value
    : newState.value
    ? Object.keys(newState.value)[0]
    : currentDbState.state) as ContentState;

  if (nextStateValue !== currentDbState.state || event.type === 'ABANDON') {
    console.log(`[Supervisor] Transitioning ${contentId} from ${currentDbState.state} to ${nextStateValue}`);
    
    await persistTransition(
      pool,
      contentId,
      currentDbState.state,
      nextStateValue as ContentState,
      'Supervisor',
      jobData.reason || null,
      newState.context.metadata,
      newState.context.attemptCounts as any
    );

    if (nextStateValue === 'REJECTED' && currentDbState.state === 'PENDING_REVIEW') {
      console.log(`[Supervisor] Manual rejection detected for unit ${contentId}. Enqueuing learning job.`);
      await getQueue('learning', channelId).add('extract_learning', {
        contentId,
        channelId,
        rejectionReason: jobData.reason || 'Manual rejection'
      });
    }

    // ── Notificações Telegram ─────────────────────────────────────────────────
    // Fire-and-forget — falha no Telegram nunca para o pipeline
    const topic = newState.context.topic;
    const criticFailCount = (newState.context.attemptCounts['CRITIC_FAIL'] ?? 0) as number;

    // Helper: spread condicional para evitar violar exactOptionalPropertyTypes
    const withChannel = channelSlug ? { channelSlug } : {};

    // Atualiza a mesma mensagem se aplicável (painel dinâmico do operador)
    const wasEdited = await tryEditTelegramMessage(
      contentId,
      channelSlug,
      topic,
      nextStateValue,
      newState.context.metadata as any
    ).catch(() => false);

    if (nextStateValue === 'PENDING_REVIEW') {
      const metadata = newState.context.metadata as any;
      const script = (metadata.script || {}) as any;
      const durationSeconds = script.estimatedDurationSeconds || undefined;
      const score = (metadata.editorialScore || metadata.score) as number | undefined;

      // hook: abertura do roteiro (primeiros 20s); cta: chamada para ação
      const hook = (script.hook as string | undefined) || undefined;
      const cta = (script.cta as string | undefined) || undefined;
      const summary = script.description || metadata.researchPackage?.summary || '';

      const videoFile = metadata.videoFile as string | undefined;
      const videoUrl = metadata.videoUrl as string | undefined;  // URL pública cross-container
      const videoFilename = videoFile ? path.basename(videoFile) : undefined;

      // Extrair créditos de mídias autênticas do manifesto para o Telegram
      let mediaCreditsText: string | undefined = undefined;
      try {
        const manifestPath = path.resolve(process.cwd(), `tmp/assets/${contentId}/story_manifest.json`);
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const credits: string[] = [];
          (manifest.scenes || []).forEach((sc: any, i: number) => {
            const meta = sc.layout?.sourcingMetadata;
            if (meta) {
              credits.push(`• Cena ${i + 1}: "${meta.title}" (${meta.source}, ${meta.license})`);
            }
          });
          if (credits.length > 0) {
            mediaCreditsText = credits.slice(0, 5).join('\n'); // Limita a 5 linhas para caber no Telegram caption
          }
        }
      } catch (err) {
        console.warn('[Supervisor] Aviso ao ler créditos do manifesto:', err);
      }

      notify('PENDING_REVIEW', {
        contentId,
        topic,
        ...withChannel,
        durationSeconds,
        score,
        summary,
        hook,
        cta,
        videoFilename,
        videoFile,
        videoUrl,  // URL pública do Zernio S3 — usada pelo Telegram em vez do path local
        mediaCreditsText,
      }).then(async (result) => {
        if (result?.ok && result.messageId) {
          // Salva o messageId e o tipo de mensagem (vídeo ou texto) nos metadados
          const client = await pool.connect();
          try {
            await client.query(
              `UPDATE content_units
               SET metadata = metadata
                 || jsonb_build_object('telegramMessageId', $1::int)
                 || jsonb_build_object('telegramIsVideo', $2::boolean)
               WHERE id = $3`,
              [result.messageId, !!videoFile, contentId]
            );
            console.log(`[Supervisor] Salvo telegramMessageId=${result.messageId} (isVideo=${!!videoFile}) para contentId ${contentId}`);
          } catch (err) {
            console.error('[Supervisor] Erro ao salvar telegramMessageId no BD:', err);
          } finally {
            client.release();
          }
        }
      }).catch((err) => {
        console.error('[Supervisor] Erro ao disparar notificação PENDING_REVIEW:', err);
      });
    } else if ((nextStateValue === 'PUBLISHED' || nextStateValue === 'PUBLISHED_PARTIAL') && !wasEdited) {
      const results = (newState.context.metadata.publicationResults ?? []) as Array<{ platform: string; platformUrl?: string }>;
      const platforms = results.map(r => r.platform);
      const platformUrls = Object.fromEntries(
        results.filter(r => r.platformUrl).map(r => [r.platform, r.platformUrl as string])
      );
      notify('PUBLISHED', { contentId, topic, ...withChannel, platforms, platformUrls }).catch(() => {});
    } else if (nextStateValue === 'ABANDONED') {
      const reason = jobData.reason as string | undefined;
      notify('ABANDONED', { contentId, topic, ...withChannel, ...(reason ? { reason } : {}) }).catch(() => {});
    } else if (currentDbState.state === 'SCRIPTED' && nextStateValue === 'EVALUATED' && criticFailCount >= 3) {
      // Roteiro voltou a EVALUATED após 3 falhas do Critic — alerta de travamento
      notify('CRITIC_STUCK', { contentId, topic, ...withChannel }).catch(() => {});
    } else if (nextStateValue === 'FAILED_QA') {
      const reason = jobData.reason as string | undefined;
      notify('FAILED_QA', { contentId, topic, ...withChannel, ...(reason ? { reason } : {}) }).catch(() => {});
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Limpeza de arquivos temporários em estados finais
    if (nextStateValue === 'PUBLISHED' || nextStateValue === 'REJECTED' || nextStateValue === 'ABANDONED') {
      const { promises: fs } = await import('fs');
      const assetsDir = path.resolve(process.cwd(), `tmp/assets/${contentId}`);
      fs.rm(assetsDir, { recursive: true, force: true }).then(() => {
        console.log(`[Supervisor] Limpeza de ativos temporários concluída para ${contentId}`);
      }).catch(err => {
        console.warn(`[Supervisor] Falha ao limpar ativos temporários para ${contentId}:`, err);
      });
    }


    try {
      await dispatchNextAction(pool, nextStateValue as ContentState, newState.context);
    } catch (err: any) {
      const queueErrorReason = err.message || String(err);
      console.error(`[Supervisor] 🚨 Falha ao enfileirar após ${nextStateValue} para unit ${contentId}: ${queueErrorReason}`);
      
      const queueErrorMetadata = {
        ...(newState.context.metadata || {}),
        queueErrorFrom: nextStateValue,
        queueErrorSource: 'dispatch-catch',
        queueErrorReason,
        queueErrorAt: new Date().toISOString()
      };

      // Wrapping persistTransition in its own try/catch so a secondary DB failure
      // (e.g. missing enum value — now fixed by migration 019) never engulfs the
      // original dispatch error. The unit always becomes visible as QUEUE_ERROR
      // when possible; if the persist itself fails, we log it but still re-throw
      // the original error.
      try {
        await persistTransition(
          pool,
          contentId,
          nextStateValue as ContentState,
          'QUEUE_ERROR',
          'Supervisor',
          `Queue enqueue failed: ${queueErrorReason}`,
          queueErrorMetadata,
          newState.context.attemptCounts as any
        );
        console.log(`[Supervisor] ✅ Unit ${contentId} marcada como QUEUE_ERROR no banco.`);
      } catch (persistErr: any) {
        console.error(`[Supervisor] ❌ Falha ao salvar QUEUE_ERROR para unit ${contentId}: ${persistErr.message}. Unit ficará visualmente presa em ${nextStateValue}.`);
      }
      
      throw err;
    }
  }
}

export async function handleSupervisorEvent(job: any): Promise<void> {
  const { pool } = await import('./db.js');

  // ── Entrada Autônoma (Cycle Clock) ──────────────────────────────────────────
  // CYCLE_STARTED não transita um content_unit existente.
  // O Supervisor cria o content_unit aqui e então despacha EVALUATE_TRIGGER,
  // iniciando o pipeline exatamente como faria uma entrada manual.
  // A única diferença registrada é origin='cycle-clock' para rastreabilidade.
  if (job.name === 'CYCLE_STARTED') {
    await handleCycleStarted(pool, job.data);
    return;
  }

  await processEvent(pool, job.name, job.data);
}

/**
 * Cria um content_unit a partir de uma oportunidade disparada pelo Cycle Clock
 * e inicia o pipeline com EVALUATE_TRIGGER.
 *
 * Idêntico ao fluxo do Scheduler (evaluateOpportunities), com:
 *   - origin = 'cycle-clock'
 *   - actor  = 'agent:cycle-clock'
 */
async function handleCycleStarted(pool: any, data: any): Promise<void> {
  const { channelId, channelSlug, opportunityId, topic, origin, cycleReason } = data;

  if (!channelId || !opportunityId || !topic) {
    console.warn('[Supervisor] CYCLE_STARTED recebido com payload incompleto. Ignorando.', data);
    return;
  }

  console.log(
    `[Supervisor] CYCLE_STARTED recebido — canal: ${channelSlug ?? channelId}, oportunidade: "${topic}" (${cycleReason})`,
  );

  try {
    // 1. Cria o content_unit com origin='cycle-clock'
    const insertRes = await pool.query(
      `INSERT INTO content_units
         (channel_id, topic, state, metadata, attempt_counts, origin)
       VALUES ($1, $2, 'DISCOVERED',
         jsonb_build_object('topic', $2::text, 'opportunity_id', $3::text),
         '{}', $4)
       RETURNING id`,
      [channelId, topic, opportunityId, origin ?? 'cycle-clock'],
    );
    const contentId: string = insertRes.rows[0].id;

    // 2. Registra a transição inicial com actor identificando a origem autônoma
    await pool.query(
      `INSERT INTO content_transitions
         (content_id, from_state, to_state, actor, reason)
       VALUES ($1, 'DISCOVERED', 'DISCOVERED', 'agent:cycle-clock', $2)`,
      [contentId, `Autonomous cycle (${cycleReason ?? 'scheduled'}) — opportunity promoted`],
    );

    // 3. Despacha EVALUATE_TRIGGER para o Supervisor — pipeline idêntico à entrada manual
    const { Queue } = await import('bullmq');
    const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const redisUrl = new URL(REDIS_URL);
    const pipelineQueue = new Queue('supervisor', {
      connection: { host: redisUrl.hostname, port: parseInt(redisUrl.port || '6379', 10), password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined },
    });

    await pipelineQueue.add('EVALUATE_TRIGGER', { contentId, channelId, topic });
    await pipelineQueue.close();

    console.log(
      `[Supervisor] Content unit criado (${contentId}) e enfileirado para avaliação editorial.`,
    );
  } catch (err) {
    console.error('[Supervisor] Erro ao processar CYCLE_STARTED:', err);
    throw err;
  }
}

function mapJobToEvent(jobType: string, data: any): ContentMachineEvent | null {
  switch (jobType) {
    case 'EVALUATE_TRIGGER':
      return { type: 'EVALUATE' };
    case 'EDITORIAL_RESULT':
      if (data.approved) return { type: 'APPROVE', score: data.score, direction: data.direction || 'default', canonArchetype: data.canonArchetype, canonTargetEmotion: data.canonTargetEmotion };
      else return { type: 'REJECT', reason: data.reason };
    case 'RESEARCH_RESULT':
      return { type: 'RESEARCH_COMPLETE', researchPackage: data.researchPackage };
    case 'SCRIPT_RESULT':
      return { type: 'SCRIPT_COMPLETE', script: data.script };
    case 'CRITIC_RESULT':
      if (data.evaluation.approved) return { type: 'CRITIC_PASS', evaluation: data.evaluation };
      else return { type: 'CRITIC_FAIL', evaluation: data.evaluation };
    case 'STORYBOARD_RESULT':
      return { type: 'STORYBOARD_COMPLETE', manifestPath: data.manifestPath };
    case 'MEDIA_RESULT':
      return { type: 'MEDIA_COMPLETE', assetUrls: data.assetUrls };
    case 'RENDER_RESULT':
      return { type: 'RENDER_COMPLETE', videoFile: data.videoFilePath, videoUrl: data.videoUrl, qaWarnings: data.qaWarnings };
    case 'QUALITY_RESULT':
      if (data.approved) return { type: 'QC_PASS', score: data.score, checklist: data.checklist };
      else return { type: 'QC_FAIL', reason: data.reason || 'Failed QC' };
    case 'CINEMATIC_RESULT':
      if (data.approved) return { type: 'CINEMATIC_PASS', evaluation: data.evaluation };
      else return { type: 'CINEMATIC_FAIL', evaluation: data.evaluation };
    case 'REVIEW_RESULT':
      if (data.action === 'approve') return { type: 'REVIEW_APPROVE', metadata: data.metadata };
      if (data.action === 'reject') return { type: 'REVIEW_REJECT', reason: data.reason || 'Manual rejection' };
      if (data.action === 'regenerate') return { type: 'REVIEW_REGENERATE' };
      return null;
    case 'PUBLISH_RESULT':
      return { type: 'PUBLISH_COMPLETE', results: [data] };
    case 'ANALYTICS_RESULT':
      return { type: 'ANALYTICS_COMPLETE', data: data.analyticsData || data };
    case 'LEARNING_RESULT':
      return { type: 'LEARNING_COMPLETE' };
    case 'ABANDON_REQUEST':
      return { type: 'ABANDON', reason: data.reason || 'Manual abandon' };
    case 'QA_FAIL_DETERMINISTIC':
      return { type: 'QA_FAIL_DETERMINISTIC', reason: data.reason || 'QA failure' };
    // CYCLE_STARTED é interceptado em handleSupervisorEvent antes de chegar aqui.
    // Este case é apenas uma salvaguarda defensiva.
    case 'CYCLE_STARTED':
      return null;
    default:
      return null;
  }
}

async function dispatchNextAction(pool: any, state: ContentState, context: ContentMachineContext) {
  const { channelId, contentId } = context;

  const defaultJobOpts = {
    jobId: `${contentId}_${state}`,
    removeOnComplete: true,
    removeOnFail: true
  };

  switch (state) {
    case 'EVALUATED':
      await getQueue('editorial', channelId).add('evaluate', { 
        contentId, 
        channelId, 
        topic: context.topic,
        opportunityId: context.metadata?.opportunity_id
      }, defaultJobOpts);
      break;
    case 'APPROVED':
      await getQueue('research', channelId).add('research', { contentId, channelId, topic: context.topic }, defaultJobOpts);
      break;
    case 'RESEARCHED':
    case 'REVISED':
      await getQueue('script', channelId).add('write_script', { 
        contentId, 
        channelId, 
        researchPackage: context.metadata.researchPackage,
        attemptNumber: (context.attemptCounts['CRITIC_FAIL'] || 0) + 1
      }, defaultJobOpts);
      break;
    case 'SCRIPTED':
      await getQueue('critic', channelId).add('review_script', {
        contentId,
        channelId,
        script: context.metadata.script,
        attemptNumber: (context.attemptCounts['CRITIC_FAIL'] || 0) + 1
      }, defaultJobOpts);
      break;
    case 'CRITIC_OK':
      await getQueue('storyboard', channelId).add('plan_storyboard', {
        contentId,
        channelId,
        script: context.metadata.script,
        canonArchetype: context.metadata.canonArchetype,
        canonTargetEmotion: context.metadata.canonTargetEmotion,
      }, defaultJobOpts);
      break;
    case 'STORYBOARD_PLANNED':
      await getQueue('media', channelId).add('generate_media', {
        contentId,
        channelId,
        storyManifestPath: context.metadata.storyManifestPath,
        canonArchetype: context.metadata.canonArchetype,
        canonTargetEmotion: context.metadata.canonTargetEmotion,
      }, defaultJobOpts);
      break;
    case 'PRODUCED':
      await getQueue('render', channelId).add('render_video', {
        contentId,
        channelId,
        script: context.metadata.script,
        assetUrls: {
          ...(context.metadata.assetUrls || {}),
          storyManifest: context.metadata.storyManifestPath,
        },
        canonArchetype: context.metadata.canonArchetype,
        canonTargetEmotion: context.metadata.canonTargetEmotion,
      }, defaultJobOpts);
      break;
    case 'PENDING_REVIEW':
      try {
        const chanRes = await pool.query('SELECT strategy FROM channel_registry WHERE id = $1', [channelId]);
        const strategy = chanRes.rows[0]?.strategy || {};
        if (strategy.autoPublish === true) {
          console.log(`[Supervisor] Auto-publish enabled for channel ${channelId}. Approving automatically.`);
          await processEvent(pool, 'REVIEW_RESULT', { contentId, channelId, action: 'approve' });
        } else {
          // Notificação já disparada na seção de transições acima
          console.log(`[Supervisor] Content ${contentId} is pending human review.`);
        }
      } catch (err) {
        console.error('[Supervisor] Error checking autoPublish flag:', err);
      }
      break;
    case 'READY_TO_PUBLISH': {
      try {
        const { rows } = await pool.query('SELECT strategy FROM channel_registry WHERE id = $1', [channelId]);
        const strategy = rows[0]?.strategy || {};
        const platformWeights = strategy.platformWeights || { youtube: 1 };
        let platforms = Object.keys(platformWeights).filter(p => platformWeights[p] > 0);
        if (platforms.length === 0) {
          platforms = ['youtube'];
        }

        console.log(`[Supervisor] Enqueuing publication jobs for platforms [${platforms.join(', ')}] (Unit: ${contentId})`);

        for (const platform of platforms) {
          const qName = `publish-${platform}`;
          // Enrich metadata from script/research phases
          const script = (context.metadata.script || {}) as any;
          
          let description = script.description || script.hook || '';
          
          // Fetch manifest to append credits from S3 URL
          const assetUrls = context.metadata.assetUrls as Record<string, string> | undefined;
          if (assetUrls?.['storyManifestUrl']) {
            try {
              const res = await fetch(assetUrls['storyManifestUrl']);
              if (res.ok) {
                const manifest = (await res.json()) as any;
                const credits = (manifest.scenes || [])
                  .filter((s: any) => s.layout?.sourcingMetadata)
                  .map((s: any) => {
                    const meta = s.layout.sourcingMetadata;
                    return `Visual: ${meta.title || 'Imagem'} por ${meta.author || 'Desconhecido'} (${meta.source} - ${meta.license})`;
                  });
                  
                const uniqueCredits = [...new Set<string>(credits)];
                
                if (uniqueCredits.length > 0) {
                  description += '\n\nCréditos de Imagem:\n' + uniqueCredits.join('\n');
                }
              }
            } catch (err) {
              console.error('[Supervisor] Failed to fetch manifest for credits:', err);
            }
          }

          const publishMetadata = {
            title: script.title || context.topic,
            description,
            tags: script.keywords || script.tags || script.hashtags || [],
          };

          await getQueue(qName, channelId).add('publish', {
            contentId,
            channelId,
            platform,
            videoFilePath: context.metadata.videoFile,
            metadata: publishMetadata,
            attemptNumber: 1
          }, {
            jobId: `${contentId}:${state}:${platform}`,
            removeOnComplete: true,
            removeOnFail: true
          });
        }
      } catch (err) {
        console.error('[Supervisor] Error enqueuing publication jobs:', err);
      }
      break;
    }
    case 'RENDERED':
      await getQueue('quality', channelId).add('qc_video', {
        contentId,
        channelId,
        videoFilePath: context.metadata.videoFile
      }, defaultJobOpts);
      break;
    case 'CINEMATIC_REVIEWING':
      await getQueue('cinematic-review', channelId).add('review_cinematic', {
        contentId,
        channelId,
        videoFilePath: context.metadata.videoFile,
        script: context.metadata.script,
        attemptNumber: (context.attemptCounts['CINEMATIC_FAIL'] || 0) + 1
      }, defaultJobOpts);
      break;
    case 'PUBLISHED':
    case 'PUBLISHED_PARTIAL':
      await getQueue('analytics', channelId).add('collect_analytics', {
        contentId,
        channelId,
        publicationResults: context.metadata.publicationResults
      }, defaultJobOpts);
      break;
    case 'ANALYZED':
      await getQueue('learning', channelId).add('extract_learning', {
        contentId,
        channelId,
        analyticsData: context.metadata.analyticsData
      }, defaultJobOpts);
      break;
    default:
      // No immediate next action for this state
      break;
  }
}

async function tryEditTelegramMessage(
  contentId: string,
  channelSlug: string | undefined,
  topic: string,
  state: ContentState,
  metadata: Record<string, any>
): Promise<boolean> {
  const telegramMessageId = metadata.telegramMessageId as number | undefined;
  if (!telegramMessageId) return false;

  const TELEGRAM_BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
  const TELEGRAM_CHAT_ID = process.env['TELEGRAM_CHAT_ID'] ?? '';
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;

  const telegramConfig = { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID };
  
  const score = (metadata.editorialScore || metadata.score) as number | undefined;
  const script = (metadata.script || {}) as any;
  const durationSeconds = script.estimatedDurationSeconds || undefined;

  const scoreText = score !== undefined ? `${(score * 100).toFixed(0)}%` : 'N/A';
  
  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}min ${s}s` : `${s}s`;
  }
  const durationText = durationSeconds !== undefined ? formatDuration(durationSeconds) : 'N/A';

  function escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
  const escTopic = escapeMarkdown(topic);
  const chanText = channelSlug ?? 'geral';

  let statusText = '';
  let linksText = '';

  if (state === 'READY_TO_PUBLISH') {
    statusText = `⏳ Publicando...`;
  } else if (state === 'PUBLISHED' || state === 'PUBLISHED_PARTIAL') {
    const results = (metadata.publicationResults ?? []) as Array<{ platform: string; success?: boolean; platformUrl?: string }>;
    const allSuccessful = results.length > 0 && results.every(r => r.success !== false);
    statusText = allSuccessful ? `🚀 Publicado!` : `⚠️ Publicado com erros (ou falha total)`;
    if (results.length > 0) {
      linksText = '\n🔗 *Links:*\n' + results.map(r => {
        if (r.success !== false) {
          return `  • *${r.platform}:* [Assistir 🔗](${r.platformUrl ?? '#'})`;
        } else {
          return `  • *${r.platform}:* ❌ Falhou!`;
        }
      }).join('\n');
    }
  } else if (state === 'LEARNED') {
    statusText = `🎓 Aprendizado Concluído (VLS)`;
    const results = (metadata.publicationResults ?? []) as Array<{ platform: string; success?: boolean; platformUrl?: string }>;
    if (results.length > 0) {
      linksText = '\n🔗 *Links:*\n' + results.map(r => {
        if (r.success !== false) {
          return `  • *${r.platform}:* [Assistir 🔗](${r.platformUrl ?? '#'})`;
        } else {
          return `  • *${r.platform}:* ❌ Falhou!`;
        }
      }).join('\n');
    }
  } else {
    return false;
  }

  const updatedText = [
    `📺 *Canal:* \`${chanText}\``,
    `📌 *Título:* *${escTopic}*`,
    `⏱️ *Duração:* \`${durationText}\``,
    `⭐ *Score Editorial:* \`${scoreText}\``,
    `💬 *Status:* ${statusText}`,
    linksText
  ].filter(Boolean).join('\n');

  const isVideo = !!metadata.telegramIsVideo;
  let res;
  if (isVideo) {
    res = await editTelegramCaption(telegramMessageId, updatedText, telegramConfig, 'Markdown');
  } else {
    res = await editTelegramMessage(telegramMessageId, updatedText, telegramConfig, 'Markdown');
  }
  return res.ok;
}
