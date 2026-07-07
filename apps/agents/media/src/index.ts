import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, MediaJobData, MediaResultData } from '@cos/events';
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

async function processMediaJob(job: Job<MediaJobData>) {
  const { contentId, channelId, script, canonArchetype, canonTargetEmotion } = job.data;

  const archetypeLabel = canonArchetype
    ? `[Canon: ${canonArchetype} / ${canonTargetEmotion}]`
    : '[sem arquétipo Canon]';

  console.log(`[Media Agent] Iniciando direção de narrativa para: "${script.title}" ${archetypeLabel}`);

  // Ensure output directory for this content unit exists
  const assetsDir = path.resolve(process.cwd(), `../../../tmp/assets/${contentId}`);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Layer 1: Director
  const direction = directNarrative(canonArchetype);
  console.log(`[Media Agent] [Director] Direção artística: ${direction.mood}`);

  // Layer 2: Storyboard Planner
  const plannedScenes = planStoryboard(script, direction);
  console.log(`[Media Agent] [Storyboard Planner] Roteiro dividido em ${plannedScenes.length} cenas (incluindo silêncios).`);

  // Layer 3: Memory Provider & Asset Resolution
  const manifest = await memoryProvider.resolveAssetsAndBuildManifest(
    contentId,
    channelId,
    plannedScenes,
    direction,
    voiceProvider,
    imageProvider,
    assetsDir
  );

  // Write Story Manifest to disk
  const manifestPath = path.join(assetsDir, 'story_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[Media Agent] Story Manifest gravado com sucesso em: ${manifestPath}`);

  // Gather URLs for compatible callbacks
  const assetUrls: Record<string, string> = {
    storyManifest: manifestPath,
  };

  // Populate dynamic scene urls for old-school callback support (fallback protection)
  manifest.scenes.forEach((scene, i) => {
    if (scene.layout.mediaUrl) {
      assetUrls[`visual_sec_${i}`] = scene.layout.mediaUrl;
    }
    if ((scene.layout as any).narrationPath) {
      assetUrls[`voiceover_sec_${i}`] = (scene.layout as any).narrationPath;
    }
  });

  const resultData: MediaResultData = {
    contentId,
    channelId,
    assetUrls,
  };

  await supervisorQueue.add('MEDIA_RESULT', resultData);
  console.log(`[Media Agent] Direção cinematográfica concluída. Manifest registrado.`);
}

async function bootstrap() {
  console.log('🚀 Iniciando Media Agent (Cinematic Engine)...');

  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('media', channelId);
    const worker = new Worker(qName, processMediaJob, { connection, concurrency: 2 });

    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);

