import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db' });

const cuId = '670e89d3-4a29-4a0a-ab84-6734bc39446e';

console.log(`Resetting Content Unit: ${cuId}`);

// We want to reset the state to SCRIPTED, and remove generated artifacts (storyboardManifest, assets, compiledVideo)
const result = await pool.query(`
  UPDATE content_units
  SET 
    state = 'SCRIPTED',
    metadata = metadata - 'storyboardManifest' - 'assets' - 'compiledVideo'
  WHERE id = $1
  RETURNING id, state
`, [cuId]);

console.log('Update result:', result.rows[0]);

await pool.end();
