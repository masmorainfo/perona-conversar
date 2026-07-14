import pg from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { MemoryProvider } from '../agents/media/src/memory-provider.js';
import { OpenAIProvider } from '../../packages/llm/src/providers/openai.js';

async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db' });
  const cuId = 'a2b8928f-78ec-4653-a37a-9d9cffbab43b';

  const r = await pool.query(`SELECT channel_id, metadata FROM content_units WHERE id = $1`, [cuId]);
  const unit = r.rows[0];

  const contentId = cuId;
  const channelId = unit.channel_id;
  const { storyManifestPath } = unit.metadata;

  console.log(`[Step 2] Iniciando síntese física de ativos para unit: ${contentId}`);

  if (!fs.existsSync(storyManifestPath)) {
    throw new Error(`Manifesto conceitual não encontrado no caminho: ${storyManifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(storyManifestPath, 'utf-8'));
  const assetsDir = path.resolve(process.cwd(), `tmp/assets/${contentId}`);

  const voiceProvider = new OpenAIProvider();
  const imageProvider = new OpenAIProvider();
  const memoryProvider = new MemoryProvider();

  // Executa a síntese física real (imagens e locução)
  const { manifest: synthesizedManifest, assetUrls } = await memoryProvider.synthesizeAssets(
    manifest,
    voiceProvider,
    imageProvider,
    assetsDir
  );

  // Sobrescreve o manifesto com os caminhos físicos dos arquivos gerados
  fs.writeFileSync(storyManifestPath, JSON.stringify(synthesizedManifest, null, 2), 'utf-8');
  console.log(`[Step 2] Story Manifest físico atualizado.`);

  // Update DB
  const updatedMetadata = { ...unit.metadata, assetUrls };
  await pool.query(`UPDATE content_units SET metadata = $1, state = 'MEDIA_SYNTHESIZED' WHERE id = $2`, [JSON.stringify(updatedMetadata), cuId]);

  console.log(`[Step 2] DB updated to MEDIA_SYNTHESIZED`);
  await pool.end();
}

run().catch(console.error);
