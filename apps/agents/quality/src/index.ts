import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, QualityJobData, QualityResultData } from '@cos/events';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeVideoQuality, loadManifest } from './quality-checker.js';

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

const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

async function processQualityJob(job: Job<QualityJobData>) {
  const { contentId, channelId, videoFilePath } = job.data;
  console.log(`[Quality Control Agent] Analisando vídeo: ${videoFilePath}`);

  // Busca manifest do DB (opção A: evita dependência de /tmp persistente entre containers)
  let manifest: any | null = null;
  try {
    const dbRes = await pool.query(
      'SELECT metadata FROM content_units WHERE id = $1',
      [contentId]
    );
    const metadata = dbRes.rows[0]?.metadata || {};
    const manifestPath: string | null = metadata.storyManifestPath || null;

    if (manifestPath) {
      manifest = loadManifest(manifestPath);
      if (manifest) {
        console.log(`[Quality Control Agent] Manifest carregado: ${manifestPath} (${manifest.scenes?.length ?? 0} cenas)`);
      } else {
        console.warn(`[Quality Control Agent] ⚠️ Manifest não encontrado em disco: ${manifestPath} — C5/C6 usarão fallback conservador.`);
      }
    } else {
      console.warn(`[Quality Control Agent] ⚠️ storyManifestPath ausente no metadata — C5/C6 não verificáveis.`);
    }
  } catch (err) {
    console.error('[Quality Control Agent] Erro ao buscar manifest do DB:', err);
  }

  // Executa verificação dos 7 critérios
  const analysis = analyzeVideoQuality(videoFilePath, manifest);

  // Log detalhado de cada critério com valores medidos
  console.log(`[Quality Control Agent] ── Resultado dos 7 Critérios ──`);
  console.log(`  C1 Áudio presente:        ${analysis.checklist.hasAudio ? '✅' : '❌'}`);
  console.log(`  C2 Dark frames ≤10%:      ${analysis.checklist.noBlackFrames ? '✅' : '❌'} (${analysis.metrics.darkFramePercentage.toFixed(1)}% | ${analysis.metrics.darkFramesCount}/${analysis.metrics.totalSampledFrames} frames)`);
  console.log(`  C3 Resolução ≥720x1280:   ${analysis.checklist.resolutionMeetsRequirements ? '✅' : '❌'} (${analysis.metrics.width}x${analysis.metrics.height})`);
  console.log(`  C4 Duração 10-120s:       ${analysis.checklist.durationWithinRange ? '✅' : '❌'} (${analysis.metrics.durationSeconds.toFixed(1)}s)`);
  console.log(`  C5 Licença+Verdict:       ${analysis.checklist.allImagesLicensedAndVerified ? '✅' : '❌'} ${!analysis.checklist.allImagesLicensedAndVerified ? '← ' + analysis.metrics.unlicensedOrRejectedScenes.join(', ') : ''}`);
  console.log(`  C6 Karaokê/timestamps:    ${analysis.checklist.hasKaraokeTimestamps ? '✅' : '❌'} (${analysis.metrics.scenesWithWordTimestamps}/${analysis.metrics.totalScenes} cenas | voiceModel: ${analysis.metrics.voiceModel ?? 'n/a'})`);
  console.log(`  C7 LUFS -24 a -9:         ${analysis.checklist.audioLevelAcceptable ? '✅' : '❌'} (${isNaN(analysis.metrics.audioLufs) ? 'N/A' : analysis.metrics.audioLufs.toFixed(1) + ' LUFS'})`);
  console.log(`  ── Score: ${(analysis.score * 100).toFixed(0)}% (${Math.round(analysis.score * 7)}/7 critérios) | Aprovado: ${analysis.approved}`);

  const resultData: QualityResultData = {
    contentId,
    channelId,
    approved: analysis.approved,
    score: analysis.score,
    checklist: {
      hasAudio: analysis.checklist.hasAudio,
      hasSubtitles: analysis.checklist.hasSubtitles,
      durationWithinRange: analysis.checklist.durationWithinRange,
      resolutionMeetsRequirements: analysis.checklist.resolutionMeetsRequirements,
      noBlackFrames: analysis.checklist.noBlackFrames,
      audioLevelAcceptable: analysis.checklist.audioLevelAcceptable,
      allImagesLicensedAndVerified: analysis.checklist.allImagesLicensedAndVerified,
      hasKaraokeTimestamps: analysis.checklist.hasKaraokeTimestamps,
    },
    reason: !analysis.approved
      ? (analysis.reason || 'Falhou nos critérios automatizados de qualidade.')
      : undefined,
  };

  await supervisorQueue.add('QUALITY_RESULT', resultData);
  console.log(`[Quality Control Agent] Análise concluída. Aprovado: ${analysis.approved} | Score: ${(analysis.score * 100).toFixed(0)}%`);
}

async function bootstrap() {
  console.log('🚀 Iniciando Quality Control Agent (7 critérios)...');

  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('quality', channelId);
    const worker = new Worker(qName, processQualityJob, {
      connection,
      concurrency: 2,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });

    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
