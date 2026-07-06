import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName } from '@cos/events';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

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

async function processRejectionFeedback(contentId: string, channelId: string, rejectionReason: string) {
  console.log(`[Learning Engine] Processando feedback de rejeição para unit ${contentId}. Motivo: "${rejectionReason}"`);

  // Buscar metadados do banco
  const dbRes = await pool.query('SELECT metadata FROM content_units WHERE id = $1', [contentId]);
  if (dbRes.rowCount === 0) {
    console.warn(`[Learning Engine] Content unit ${contentId} não encontrada no BD.`);
    return;
  }
  const metadata = dbRes.rows[0].metadata || {};
  const script = metadata.script || {};

  // DNA path
  const dnaPath = path.resolve(process.cwd(), '../../../dna/kairo_dna.json');
  if (!fs.existsSync(dnaPath)) {
    console.warn(`[Learning Engine] Arquivo DNA não encontrado em ${dnaPath}.`);
    return;
  }
  
  let dna: any;
  try {
    dna = JSON.parse(fs.readFileSync(dnaPath, 'utf-8'));
  } catch (err) {
    console.error('[Learning Engine] Erro ao ler DNA JSON:', err);
    return;
  }

  // Identificar genes ativos no vídeo rejeitado
  const activeGenes: string[] = [];

  // 1. Gancho (narrative_hook)
  const hookText = (script.hook || '').toLowerCase();
  if (hookText.includes('budismo') || hookText.includes('paz interior') || hookText.includes('alma')) {
    activeGenes.push('existential_contradiction');
  } else if (hookText.includes('1994') || hookText.includes('pênalti') || hookText.includes('isolou')) {
    activeGenes.push('factual_historical');
  }

  // 2. Trilha (audio_tempo)
  const visualNotes = script.body ? script.body.map((b: any) => (b.visualNote || '').toLowerCase()).join(' ') : '';
  if (visualNotes.includes('piano') || visualNotes.includes('drone') || visualNotes.includes('slow')) {
    activeGenes.push('solene_slow_piano');
  }

  // 3. Paleta visual (visual_palette)
  if (visualNotes.includes('preto e branco') || visualNotes.includes('película') || visualNotes.includes('warm')) {
    activeGenes.push('monochrome_to_warm_90s');
  }

  console.log(`[Learning Engine] Genes identificados no conteúdo rejeitado: [${activeGenes.join(', ')}]`);

  // Aplicar penalização aos genes identificados seguindo a escala de maturidade:
  // Consolidado -> Validado -> Experimental -> Dormant
  let updated = false;
  if (dna.genes) {
    for (const category of Object.keys(dna.genes)) {
      for (const gene of Object.keys(dna.genes[category])) {
        if (activeGenes.includes(gene)) {
          const oldMaturity = dna.genes[category][gene].maturity;
          let newMaturity = oldMaturity;
          
          if (oldMaturity === 'Consolidado') newMaturity = 'Validado';
          else if (oldMaturity === 'Validado') newMaturity = 'Experimental';
          else if (oldMaturity === 'Experimental') newMaturity = 'Dormant';
          
          if (oldMaturity !== newMaturity) {
            dna.genes[category][gene].maturity = newMaturity;
            console.log(`[Learning Engine] Maturidade do gene "${gene}" rebaixada de "${oldMaturity}" para "${newMaturity}" devido à rejeição qualitativa: "${rejectionReason}"`);
            updated = true;
          }
        }
      }
    }
  }

  if (updated) {
    try {
      fs.writeFileSync(dnaPath, JSON.stringify(dna, null, 2), 'utf-8');
      console.log('[Learning Engine] Arquivo kairo_dna.json atualizado com sucesso com novos pesos!');
    } catch (err) {
      console.error('[Learning Engine] Erro ao salvar novas diretrizes de DNA:', err);
    }
  }
}

async function processLearningJob(job: Job<any>) {
  const { contentId, channelId, rejectionReason } = job.data;
  
  if (rejectionReason) {
    await processRejectionFeedback(contentId, channelId, rejectionReason);
    await supervisorQueue.add('LEARNING_RESULT', { contentId, channelId });
    return;
  }

  console.log(`[Learning Engine] Analisando performance do conteúdo ${contentId} no canal ${channelId}.`);

  // Fetch strategy
  const res = await pool.query('SELECT strategy FROM channel_registry WHERE id = $1', [channelId]);
  if (res.rowCount === 0) {
    throw new Error(`Channel ${channelId} not found`);
  }
  const strategy = res.rows[0].strategy;

  // Mock simulating an update to the strategy
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  if (strategy.platformWeights && strategy.platformWeights.youtube) {
    // A slight bump in weight just to prove mutation
    const newWeight = Math.min(strategy.platformWeights.youtube + 0.01, 1.0);
    strategy.platformWeights.youtube = parseFloat(newWeight.toFixed(2));
    strategy.updatedAt = new Date().toISOString();
    strategy.updatedBy = 'learning_engine_v1';
    
    await pool.query('UPDATE channel_registry SET strategy = $1 WHERE id = $2', [strategy, channelId]);
    console.log(`[Learning Engine] Estratégia atualizada. YouTube weight agora é ${strategy.platformWeights.youtube}.`);
  }

  // Notify Supervisor that content has reached the end of its lifecycle
  await supervisorQueue.add('LEARNING_RESULT', { contentId, channelId });
}

async function bootstrap() {
  console.log('🚀 Iniciando Learning Engine...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('learning', channelId);
    const worker = new Worker(qName, processLearningJob, { connection, concurrency: 1 });
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
