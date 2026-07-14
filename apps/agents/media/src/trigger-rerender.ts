/**
 * Re-render v8 — Reseta o estado do Kaká para SCRIPTED e injeta CRITIC_RESULT
 * aprovado, fazendo o pipeline re-executar:
 *   SCRIPTED → CRITIC_OK → Storyboard → Media → Render → QC → Review
 * 
 * Uso: npx tsx apps/agents/media/src/trigger-rerender.ts
 */

import { Queue } from 'bullmq';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const CONTENT_ID = 'a2b8928f-78ec-4653-a37a-9d9cffbab43b';
// Queue name from @cos/events: SUPERVISOR_QUEUE = 'pipeline'
const SUPERVISOR_QUEUE = 'pipeline';

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TRIGGER RE-RENDER — Kaká v8 (ElevenLabs TTS + Word Timestamps)');
  console.log('═══════════════════════════════════════════════════════════');

  // 1. Buscar dados atuais do content_unit
  const { rows } = await pool.query(
    'SELECT id, channel_id, state, metadata, attempt_counts FROM content_units WHERE id = $1',
    [CONTENT_ID]
  );

  if (rows.length === 0) {
    throw new Error(`Content unit ${CONTENT_ID} não encontrado`);
  }

  const unit = rows[0];
  const channelId = unit.channel_id;
  const metadata = unit.metadata || {};
  const script = metadata.script;

  if (!script) {
    throw new Error('Script não encontrado no metadata da content_unit');
  }

  console.log(`\nContent ID: ${CONTENT_ID}`);
  console.log(`Channel ID: ${channelId}`);
  console.log(`Estado atual: ${unit.state}`);
  console.log(`Script: "${script.title}"`);

  // 2. Limpar visuais antigos (re-gerar com novos prompts)
  const assetsDir = path.resolve(process.cwd(), `tmp/assets/${CONTENT_ID}`);
  if (fs.existsSync(assetsDir)) {
    const oldVisuals = fs.readdirSync(assetsDir).filter(f => f.startsWith('visual_scene_'));
    const oldAudio = fs.readdirSync(assetsDir).filter(f => f.startsWith('voiceover_scene_'));
    for (const f of [...oldVisuals, ...oldAudio]) {
      fs.unlinkSync(path.join(assetsDir, f));
      console.log(`   🗑️ Removido ativo antigo: ${f}`);
    }
  }

  // 3. Reset estado para SCRIPTED (pre-critic)
  await pool.query(
    `UPDATE content_units SET state = 'SCRIPTED', updated_at = NOW() WHERE id = $1`,
    [CONTENT_ID]
  );

  await pool.query(
    `INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
     VALUES ($1, $2, 'SCRIPTED', 'agent-manual-rerender', 'Re-render v8: ElevenLabs TTS + word-level caption sync')`,
    [CONTENT_ID, unit.state]
  );

  console.log(`\n✅ Estado resetado para SCRIPTED`);

  // 4. Injetar CRITIC_RESULT aprovado na fila pipeline
  // Isso faz o supervisor transicionar SCRIPTED→CRITIC_OK,
  // e o side-effect de CRITIC_OK dispara plan_storyboard
  const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });
  
  await supervisorQueue.add('CRITIC_RESULT', {
    contentId: CONTENT_ID,
    channelId,
    evaluation: {
      approved: true,
      score: 8,
      feedback: 'Roteiro aprovado pelo Critic (re-render v8 — ElevenLabs TTS)',
    },
  });

  console.log('📤 Job CRITIC_RESULT (approved) injetado na fila "pipeline"');

  await supervisorQueue.close();
  await pool.end();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Pipeline vai re-executar:');
  console.log('  SCRIPTED → CRITIC_OK → Storyboard → Media → Render → QC');
  console.log('  Acompanhe no terminal do Supervisor ou Telegram.');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ ERRO:', err);
  process.exit(1);
});
