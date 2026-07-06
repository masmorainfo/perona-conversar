import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const { Client } = pg;

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
await client.connect();
await client.query(sql);
console.log('✓ Tabelas agent_messages e learning_entries criadas com sucesso.');
await client.end();
