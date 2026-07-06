import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Carrega .env manualmente (sem dotenv — não disponível na raiz do workspace)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
}

const require = createRequire(import.meta.url);
const pg = require('./node_modules/pg/lib/index.js');
const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});


async function main() {
  await client.connect();

  // ── Verificação do pipeline de tradução ────────────────────────────────────
  console.log('\n═══ SINAIS TRADUZIDOS (últimos 50) ═══');
  const langRes = await client.query(`
    SELECT id, source, detected_lang, original_title, title, score
    FROM normalized_signals
    WHERE detected_lang IS NOT NULL AND detected_lang <> 'latin' AND detected_lang <> 'und'
    ORDER BY created_at DESC
    LIMIT 50
  `);
  if (langRes.rows.length === 0) {
    console.log('⚠️  Nenhum sinal com idioma não-latino encontrado ainda.');
    console.log('   (Pipeline de tradução ainda não foi acionado ou todos os títulos já estão em PT-BR)');
  } else {
    console.log(`Sinais traduzidos: ${langRes.rows.length}`);
    for (const r of langRes.rows) {
      console.log(`  [${r.detected_lang}] ${r.source}`);
      console.log(`    Original : ${r.original_title}`);
      console.log(`    Traduzido: ${r.title}`);
    }
  }

  // ── Cobertura de idiomas detectados ───────────────────────────────────────
  console.log('\n═══ DISTRIBUIÇÃO DE IDIOMAS ═══');
  const distRes = await client.query(`
    SELECT detected_lang, COUNT(*) as total
    FROM normalized_signals
    WHERE detected_lang IS NOT NULL
    GROUP BY detected_lang
    ORDER BY total DESC
  `);
  for (const r of distRes.rows) {
    const bar = '█'.repeat(Math.min(40, Math.floor(Number(r.total) / 2)));
    console.log(`  ${(r.detected_lang || 'und').padEnd(6)} ${r.total.toString().padStart(4)}  ${bar}`);
  }

  // ── Temas agrupados (view principal) ──────────────────────────────────────
  console.log('\n═══ TEMAS AGRUPADOS (últimos 100 sinais) ═══');
  const res = await client.query('SELECT id, source, title, score FROM normalized_signals ORDER BY created_at DESC LIMIT 100');
  console.log(`Total de sinais: ${res.rows.length}`);
  
  const grouped = groupSignals(res.rows);
  console.log(`Total de temas: ${grouped.length}\n`);
  for (const g of grouped) {
    console.log(`📌 "${g.title}" — Score: ${g.combinedScore.toFixed(0)} | Fontes: ${g.sources.join(', ')} | Sinais: ${g.signals.length}`);
    for (const s of g.signals) {
      console.log(`     [${s.source}] ${s.title}`);
    }
  }

  await client.end();
}

function getWords(text) {
  const stopwords = new Set([
    'a', 'o', 'e', 'de', 'da', 'do', 'in', 'on', 'the', 'and', 'to', 'for', 'of', 'with', 'is', 'at', 'under',
    'um', 'uma', 'em', 'para', 'com', 'no', 'na', 'nos', 'nas', 'por', 'sobre', 'que', 'se', 'com'
  ]);
  const cleaned = text.toLowerCase().replace(/[#\-_@]/g, ' ');
  const tokens = cleaned.split(/\s+/);
  const words = new Set();
  for (const t of tokens) {
    const w = t.replace(/[^a-z0-9]/g, '');
    if (w && w.length > 2 && !stopwords.has(w)) {
      words.add(w);
    }
  }
  return words;
}

function calculateJaccard(s1, s2) {
  const w1 = getWords(s1);
  const w2 = getWords(s2);
  if (w1.size === 0 || w2.size === 0) return 0;
  
  const intersection = new Set([...w1].filter(x => w2.has(x)));
  const union = new Set([...w1, ...w2]);
  
  return intersection.size / union.size;
}

function groupSignals(signals) {
  const groups = [];
  
  for (const signal of signals) {
    let matchedGroup = null;
    
    for (const group of groups) {
      const similarity = calculateJaccard(signal.title, group.title);
      if (similarity >= 0.25) {
        matchedGroup = group;
        break;
      }
    }
    
    if (matchedGroup) {
      matchedGroup.signals.push(signal);
      if (!matchedGroup.sources.includes(signal.source)) {
        matchedGroup.sources.push(signal.source);
      }
      if (signal.score > matchedGroup.maxScore) {
        matchedGroup.maxScore = signal.score;
        matchedGroup.title = signal.title;
      }
    } else {
      groups.push({
        title: signal.title,
        sources: [signal.source],
        maxScore: signal.score,
        combinedScore: 0,
        signals: [signal]
      });
    }
  }
  
  for (const group of groups) {
    const rawScore = group.maxScore * 100;
    const boost = (group.sources.length - 1) * 15;
    group.combinedScore = Math.min(100, rawScore + boost);
  }
  
  return groups.sort((a, b) => b.combinedScore - a.combinedScore);
}

main().catch(console.error);
