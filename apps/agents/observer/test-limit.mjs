import pg from 'pg';
import { OpportunityEngine } from './dist/engine.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/perona',
});

const engine = new OpportunityEngine(pool);

async function runTest() {
  const today = new Date().toISOString().split('T')[0];

  console.log('\n--- 1. Preparando o banco (criando tabela se não existir) ---');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_daily_limits (
      date_key DATE PRIMARY KEY,
      executions INT NOT NULL DEFAULT 0,
      alert_sent BOOLEAN NOT NULL DEFAULT false
    );
  `);

  console.log(`\n--- 2. Setando executions para 14 (não deve bloquear) ---`);
  await pool.query(`
    INSERT INTO system_daily_limits (date_key, executions, alert_sent) 
    VALUES ($1, 14, false)
    ON CONFLICT (date_key) DO UPDATE SET executions = 14, alert_sent = false;
  `, [today]);

  await engine.generateOpportunities();

  console.log(`\n--- 3. Setando executions para 15 (DEVE bloquear e enviar Telegram) ---`);
  await pool.query(`
    UPDATE system_daily_limits SET executions = 15, alert_sent = false WHERE date_key = $1;
  `, [today]);

  await engine.generateOpportunities();

  console.log(`\n--- 4. Setando executions para 16 (DEVE bloquear, mas NÃO reenviar Telegram) ---`);
  await pool.query(`
    UPDATE system_daily_limits SET executions = 16 WHERE date_key = $1;
  `, [today]);

  await engine.generateOpportunities();

  console.log('\n✅ Teste concluído.');
  await pool.end();
}

runTest().catch(console.error);
