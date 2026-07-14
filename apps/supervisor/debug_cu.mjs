import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db' });

const r = await pool.query("SELECT id, topic, state, metadata FROM content_units WHERE id = '670e89d3-4a29-4a0a-ab84-6734bc39446e'");
const cu = r.rows[0];
console.log('=== CONTENT UNIT ===');
console.log('Topic:', cu.topic);
console.log('State:', cu.state);
console.log('\n=== METADATA (script) ===');
const script = cu.metadata?.script;
if (script) {
  console.log('Title:', script.title);
  console.log('Hook:', script.hook);
  console.log('Description:', script.description?.slice(0, 200));
} else {
  console.log('No script in metadata');
}
console.log('\n=== METADATA (researchPackage) ===');
const rp = cu.metadata?.researchPackage;
if (rp) {
  console.log('Topic used:', rp.topic || rp.query || 'N/A');
  console.log('Summary:', (rp.summary || rp.research || '').slice(0, 200));
}

await pool.end();
