import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

async function main() {
  await client.connect();

  const channelsRes = await client.query('SELECT id FROM channel_registry LIMIT 1');
  if (channelsRes.rows.length === 0) {
    console.error('No channels found in DB');
    await client.end();
    return;
  }
  const channelId = channelsRes.rows[0].id;

  console.log(`Inserting mock PENDING_REVIEW content for channel ${channelId}...`);
  const insertRes = await client.query(`
    INSERT INTO content_units (
      channel_id, 
      topic,
      state,
      metadata
    ) VALUES (
      $1,
      'Mock Review Content: O Futuro da IA',
      'PENDING_REVIEW',
      $2
    ) RETURNING id, state;
  `, [
    channelId,
    JSON.stringify({
      editorialReason: 'Tópico extremamente relevante e alinhado com as diretrizes do canal, apresentando alta probabilidade de engajamento.',
      editorialScore: 0.95,
      editorialDirection: 'Focar na dualidade entre avanço tecnológico e impacto social.',
      script: {
        title: 'O Futuro da Inteligência Artificial em 2026',
        description: 'Um olhar profundo sobre como a IA está remodelando nossa sociedade, trabalho e relações. #IA #Futuro #Tecnologia',
        body: [
          { id: 'sec1', content: 'A Inteligência Artificial não é mais uma promessa futura.', durationSeconds: 5 },
          { id: 'sec2', content: 'Ela já reescreve as regras de como trabalhamos e vivemos hoje.', durationSeconds: 6 }
        ]
      },
      // Assuming missing media to show that aspect or a placeholder
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4'
    })
  ]);
  
  const newId = insertRes.rows[0].id;
  console.log(`Created mock content unit with ID: ${newId}`);

  await client.end();
}

main().catch(console.error);
