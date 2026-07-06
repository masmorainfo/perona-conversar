import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

async function main() {
  await client.connect();
  const transitions = await client.query('SELECT * FROM content_transitions WHERE content_id = $1 ORDER BY transitioned_at ASC', ['8ec42fed-6e26-46d8-8eee-20e2e2aaccbc']);
  console.log('TRANSITIONS:');
  console.log(JSON.stringify(transitions.rows, null, 2));

  await client.end();
}

main().catch(console.error);
