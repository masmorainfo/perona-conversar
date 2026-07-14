import pg from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { compositeVideo } from '../agents/render/src/video-compositor.js';

async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db' });
  const cuId = 'a2b8928f-78ec-4653-a37a-9d9cffbab43b';

  const r = await pool.query(`SELECT channel_id, metadata FROM content_units WHERE id = $1`, [cuId]);
  const unit = r.rows[0];

  const contentId = cuId;
  const channelId = unit.channel_id;
  const { script, assetUrls, canonArchetype } = unit.metadata;

  console.log(`[Step 3] Iniciando renderização para unit: ${contentId}`);

  const outDir = path.resolve(process.cwd(), `tmp/outputs`);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const videoFileName = `${channelId}_${contentId}.mp4`;
  const videoFilePath = path.join(outDir, videoFileName);

  const finalAssetUrls = {
    ...assetUrls,
    storyManifest: unit.metadata.storyManifestPath,
  };

  await compositeVideo(contentId, script, finalAssetUrls, videoFilePath, canonArchetype);
  console.log(`[Step 3] Vídeo renderizado com sucesso em: ${videoFilePath}`);

  const updatedMetadata = { ...unit.metadata, videoFile: videoFilePath };
  await pool.query(`UPDATE content_units SET metadata = $1, state = 'PENDING_REVIEW' WHERE id = $2`, [JSON.stringify(updatedMetadata), cuId]);

  console.log(`[Step 3] DB updated to PENDING_REVIEW`);
  await pool.end();
}

run().catch(console.error);
