/**
 * INJEÇÃO DE CICLO DE TESTE COMPLETO
 * Executar via: railway run node scratch/inject_test_cycle.js
 * 
 * Tema: Gareth Bale — trending hoje no Trends24
 * DNA KAIRO: herói trágico, silêncio e grandeza
 */

import pg from 'pg';
import { Queue } from 'bullmq';

const DB_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

if (!DB_URL || !REDIS_URL) {
  console.error('❌ DATABASE_URL ou REDIS_URL não definidos.');
  console.error('   Execute via: railway run node scratch/inject_test_cycle.js');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DB_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15000,
});

const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
};

// Descobrir o nome real da fila do Supervisor
const SUPERVISOR_QUEUE = 'pipeline'; // definido em packages/events/src/index.ts

const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║         INJEÇÃO — Ciclo de Teste Completo                ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');
console.log(`  DB: ${DB_URL.substring(0, 40)}...`);
console.log(`  Redis: ${redisUrl.hostname}:${redisUrl.port}`);
console.log(`  Fila: ${SUPERVISOR_QUEUE}\n`);

// 1. Buscar canal kairo-futebol
const { rows: channels } = await pool.query(
  `SELECT id, slug FROM channel_registry WHERE slug = 'kairo-futebol' AND is_active = true LIMIT 1`
);
if (channels.length === 0) {
  console.error('❌ Canal kairo-futebol não encontrado!');
  process.exit(1);
}
const channel = channels[0];
console.log(`✓ Canal: ${channel.slug} (${channel.id})\n`);

// 2. Criar oportunidade QUEUED com tema fresh do Trends24 de hoje
const TOPIC = 'Gareth Bale: O Herói Silencioso que Nunca Recebeu o Reconhecimento que Merecia';
const ORG_ID = '00000000-0000-0000-0000-000000000000';

const { rows: oppRows } = await pool.query(
  `INSERT INTO content_opportunities
     (org_id, channel_id, title, description, base_score, dynamic_score, status, 
      category, source_count, geographic_expansion, editorial_compatibility, momentum,
      source_signals)
   VALUES ($1, $2, $3, $4, $5, $5, 'QUEUED',
      'sports', 3, 0.7, 0.9, 0.8,
      '[{"sensor": "Trends24", "topic": "Gareth Bale", "position": 1, "collectedAt": "${new Date().toISOString()}"}]'::jsonb)
   RETURNING id, title, status`,
  [
    ORG_ID,
    channel.id,
    TOPIC,
    'Gareth Bale trending hoje. DNA KAIRO: herói trágico, grandeza no Real Madrid vs ostracismo na seleção galesa. Silêncio, culpa e legado.',
    92,
  ]
);
const opp = oppRows[0];
console.log(`✓ Oportunidade criada: "${opp.title}"`);
console.log(`  ID: ${opp.id} | Status: ${opp.status}\n`);

// 3. Disparar CYCLE_STARTED para o Supervisor
console.log('🚀 Disparando CYCLE_STARTED para o Supervisor...');
const job = await supervisorQueue.add('CYCLE_STARTED', {
  channelId: channel.id,
  channelSlug: channel.slug,
  opportunityId: opp.id,
  topic: TOPIC,
  origin: 'manual',
  cycleReason: 'manual-test',
  triggeredAt: new Date().toISOString(),
});

console.log(`✓ Job enfileirado! Job ID: ${job.id}`);
console.log('\n📺 Pipeline iniciado no Railway:');
console.log('   Supervisor → Research → Script → Critic → Storyboard → Media → Render → QA → PENDING_REVIEW → Telegram');
console.log('\n⏳ Em ~10-15 min você receberá o card no Telegram para aprovação.\n');

await pool.end();
await supervisorQueue.close();
console.log('✓ Injeção concluída.');
