import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, MediaJobData, MediaResultData, StoryboardJobData, StoryboardResultData } from '@cos/events';
import { OpenAIProvider, VoiceProvider, ImageProvider } from '@cos/llm';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { directNarrative } from './director.js';
import { planStoryboard } from './storyboard-planner.js';
import { MemoryProvider } from './memory-provider.js';
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

const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });
const voiceProvider: VoiceProvider = new OpenAIProvider();
const imageProvider: ImageProvider = new OpenAIProvider();
const memoryProvider = new MemoryProvider();

async function processStoryboardJob(job: Job<StoryboardJobData>) {
  const { contentId, channelId, script, canonArchetype, canonTargetEmotion } = job.data;
  const archetypeLabel = canonArchetype ? `[Canon: ${canonArchetype}]` : '[sem arquétipo]';
  console.log(`[Storyboard Agent] Iniciando planejamento visual para: "${script.title}" ${archetypeLabel}`);

  const assetsDir = path.resolve(process.cwd(), `../../../tmp/assets/${contentId}`);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Layer 1: Director
  const direction = directNarrative(canonArchetype);
  console.log(`[Storyboard Agent] [Director] Direção artística: ${direction.mood}`);

  // Layer 2: Storyboard Planner
  const plannedScenes = planStoryboard(script, direction);
  console.log(`[Storyboard Agent] [Planner] Roteiro dividido em ${plannedScenes.length} batidas.`);

  // Layer 3: Memory Provider - Resolução conceitual pura (sem side-effects de IA)
  const manifest = await memoryProvider.buildConceptManifest(contentId, channelId, plannedScenes, direction, script.title);

  // Escreve o manifesto conceitual inicial no disco
  const manifestPath = path.join(assetsDir, 'story_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[Storyboard Agent] Story Manifest conceitual gravado em: ${manifestPath}`);

  const resultData: StoryboardResultData = {
    contentId,
    channelId,
    manifestPath,
  };

  await supervisorQueue.add('STORYBOARD_RESULT', resultData);
  console.log(`[Storyboard Agent] Planejamento concluído. Evento enviado.`);
}

async function processMediaJob(job: Job<MediaJobData>) {
  const { contentId, channelId, storyManifestPath } = job.data;
  console.log(`[Media Agent] Iniciando síntese física de ativos para unit: ${contentId}`);

  if (!fs.existsSync(storyManifestPath)) {
    throw new Error(`Manifesto conceitual não encontrado no caminho: ${storyManifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(storyManifestPath, 'utf-8'));
  const assetsDir = path.resolve(process.cwd(), `../../../tmp/assets/${contentId}`);

  // Executa a síntese física real (imagens e locução)
  const { manifest: synthesizedManifest, assetUrls } = await memoryProvider.synthesizeAssets(
    manifest,
    voiceProvider,
    imageProvider,
    assetsDir
  );

  // Sobrescreve o manifesto com os caminhos físicos dos arquivos gerados
  fs.writeFileSync(storyManifestPath, JSON.stringify(synthesizedManifest, null, 2), 'utf-8');
  console.log(`[Media Agent] Story Manifest físico atualizado.`);

  const resultData: MediaResultData = {
    contentId,
    channelId,
    assetUrls,
  };

  await supervisorQueue.add('MEDIA_RESULT', resultData);
  console.log(`[Media Agent] Síntese física concluída e URLs de mídias enviadas.`);
}

async function bootstrap() {
  console.log('🚀 Iniciando Media & Storyboard Agent (Cinematic Engine)...');

  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    // 1. Ouvir fila storyboard
    const storyboardQName = queueName('storyboard', channelId);
    const storyboardWorker = new Worker(storyboardQName, processStoryboardJob, { connection, concurrency: 2, lockDuration: 3 * 60 * 1000, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } });
    storyboardWorker.on('ready', () => console.log(`✅ Ouve fila: ${storyboardQName}`));
    storyboardWorker.on('error', err => console.error(`🚨 Erro no worker ${storyboardQName}:`, err));

    // 2. Ouvir fila media
    const mediaQName = queueName('media', channelId);
    const mediaWorker = new Worker(mediaQName, processMediaJob, { connection, concurrency: 2, lockDuration: 3 * 60 * 1000, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } });
    mediaWorker.on('ready', () => console.log(`✅ Ouve fila: ${mediaQName}`));
    mediaWorker.on('error', err => console.error(`🚨 Erro no worker ${mediaQName}:`, err));
  }
}

bootstrap().catch(err => console.error('🚨 Erro no bootstrap do Media Agent:', err));
