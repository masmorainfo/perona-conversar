import pg from 'pg';
import { Queue } from 'bullmq';

const pool = new pg.Pool({ connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db' });
const connection = { host: 'localhost', port: 6379 };

// Buscar channel
const chanRes = await pool.query("SELECT id FROM channel_registry WHERE slug = 'teleserie'");
const channelId = chanRes.rows[0].id;

const topic = "A Redenção de Kaká: Da cadeira de rodas ao Ballon d'Or";

// Criar nova content unit
const ins = await pool.query(
  "INSERT INTO content_units (org_id, channel_id, topic, state, metadata, attempt_counts) VALUES ('00000000-0000-0000-0000-000000000000',$1,$2,'DISCOVERED',jsonb_build_object('topic',$2::text),'{}') RETURNING id",
  [channelId, topic]
);
const contentId = ins.rows[0].id;
console.log('✅ Nova Content Unit:', contentId);

// Disparar pipeline
const q = new Queue('pipeline', { connection });
await q.add('EVALUATE_TRIGGER', { contentId, channelId, topic });
await q.close();
console.log('🚀 Pipeline disparado (agora com timeout 120s no LLM)');

// Notificar Telegram
const botToken = '8513304040:AAHF-w_vsE0ZcTyljz2m5-3dbPAJZhZfVg8';
const chatId = '-1003892983168';
const t = topic.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: chatId, text: `🔄 *Re\\-execução Etapa A* \\(LLM real\\)\n\n_${t}_\n\nAgora com timeout de 120s — o NIM vai responder de verdade\\.`, parse_mode: 'MarkdownV2' }),
});

await pool.end();
