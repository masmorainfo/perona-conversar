import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { DefaultScoringStrategy } from './score.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

const DYNAMIC_SCORE_THRESHOLD = 80;

async function evaluateOpportunities() {
  try {
    const { rows: opportunities } = await pool.query(
      `SELECT id, base_score, created_at, title, category, source_count, geographic_expansion, editorial_compatibility, momentum FROM content_opportunities WHERE status = 'PENDING'`
    );

    if (opportunities.length === 0) return;

    console.log(`[Scheduler] Avaliando ${opportunities.length} oportunidades PENDING...`);
    const now = Date.now();
    const scoringStrategy = new DefaultScoringStrategy();

    for (const opp of opportunities) {
      const createdAt = new Date(opp.created_at).getTime();
      const factors = {
        category: opp.category,
        sourceCount: opp.source_count,
        geographicExpansion: opp.geographic_expansion,
        editorialCompatibility: opp.editorial_compatibility,
        momentum: opp.momentum,
      };
      const dynamicScore = scoringStrategy.calculateScore(opp.base_score, factors, createdAt, now);

      if (dynamicScore >= DYNAMIC_SCORE_THRESHOLD) {
        console.log(`[Scheduler] 🌟 Oportunidade promovida para QUEUED: "${opp.title}" (Score: ${dynamicScore.toFixed(2)})`);
        await pool.query(
          `UPDATE content_opportunities SET dynamic_score = $1, status = 'QUEUED', updated_at = NOW() WHERE id = $2`,
          [dynamicScore, opp.id]
        );
      } else if (dynamicScore <= 0) {
        console.log(`[Scheduler] 🗑️ Oportunidade descartada por decay: "${opp.title}"`);
        await pool.query(
          `UPDATE content_opportunities SET dynamic_score = $1, status = 'DISCARDED', updated_at = NOW() WHERE id = $2`,
          [dynamicScore, opp.id]
        );
      } else {
        console.log(`[Scheduler] 🔄 Oportunidade mantida como PENDING: "${opp.title}" (Score: ${dynamicScore.toFixed(2)})`);
        await pool.query(
          `UPDATE content_opportunities SET dynamic_score = $1, updated_at = NOW() WHERE id = $2`,
          [dynamicScore, opp.id]
        );
      }
    }
  } catch (err) {
    console.error(`[Scheduler] Erro ao avaliar oportunidades:`, err);
  } finally {
    await pool.end();
  }
}

evaluateOpportunities().catch(console.error);
