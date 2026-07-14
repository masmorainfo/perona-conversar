import pg from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { directNarrative } from '../agents/media/src/director.js';
import { planStoryboard } from '../agents/media/src/storyboard-planner.js';
import { MemoryProvider } from '../agents/media/src/memory-provider.js';

async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db' });
  const cuId = 'a2b8928f-78ec-4653-a37a-9d9cffbab43b';

  const r = await pool.query(`SELECT channel_id, metadata FROM content_units WHERE id = $1`, [cuId]);
  const unit = r.rows[0];

  const contentId = cuId;
  const channelId = unit.channel_id;
  const { script, canonArchetype, canonTargetEmotion } = unit.metadata;

  console.log(`[Step 1] Iniciando planejamento visual para: "${script.title}"`);

  const assetsDir = path.resolve(process.cwd(), `tmp/assets/${contentId}`);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const direction = directNarrative(canonArchetype);
  console.log(`[Step 1] [Director] Direção artística: ${direction.mood}`);

  const plannedScenes = planStoryboard(script, direction);
  console.log(`[Step 1] [Planner] Roteiro dividido em ${plannedScenes.length} batidas.`);

  const memoryProvider = new MemoryProvider();
  const manifest = await memoryProvider.buildConceptManifest(contentId, channelId, plannedScenes, direction);

  const manifestPath = path.join(assetsDir, 'story_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[Step 1] Story Manifest conceitual gravado em: ${manifestPath}`);

  // Update DB metadata with manifestPath and state
  const updatedMetadata = { ...unit.metadata, storyManifestPath: manifestPath };
  await pool.query(`UPDATE content_units SET metadata = $1, state = 'STORYBOARD_PLANNED' WHERE id = $2`, [JSON.stringify(updatedMetadata), cuId]);

  console.log(`[Step 1] DB updated to STORYBOARD_PLANNED`);
  await pool.end();
}

run().catch(console.error);
