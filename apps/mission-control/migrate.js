const { Client } = require('pg');
require('dotenv').config();

const sql = `
  CREATE TABLE IF NOT EXISTS agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES content_units(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    round INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_agent_messages_content_id ON agent_messages(content_id);

  CREATE TABLE IF NOT EXISTS learning_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES channel_registry(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    impact TEXT NOT NULL,
    source_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_learning_entries_channel_id ON learning_entries(channel_id);
`;

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.query(sql))
  .then(() => { console.log('✓ Tabelas agent_messages e learning_entries criadas com sucesso.'); client.end(); })
  .catch((e) => { console.error('Erro:', e.message); client.end(); process.exit(1); });
