import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db' });
const cuId = 'a2b8928f-78ec-4653-a37a-9d9cffbab43b';

console.log(`Resetting Content Unit (Kaká): ${cuId}`);

const result = await pool.query(`
  UPDATE content_units
  SET 
    state = 'CRITIC_OK',
    metadata = metadata - 'storyManifestPath' - 'assetUrls' - 'videoFile'
  WHERE id = $1
  RETURNING id, channel_id, metadata
`, [cuId]);

const unit = result.rows[0];
console.log('Update result:', { id: unit.id, state: 'CRITIC_OK', channel_id: unit.channel_id });

await pool.end();
