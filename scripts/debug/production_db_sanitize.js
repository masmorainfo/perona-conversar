import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL não encontrada no arquivo .env');
  process.exit(1);
}

const KAIRO_CHANNEL_ID = '25b9449d-28f5-4758-9d84-f7b23a067d7d';

async function sanitize() {
  console.log('🚀 Iniciando saneamento do banco de dados para Produção...');
  const pool = new pg.Pool({ connectionString });

  try {
    // 1. Identifica IDs de unidades que não pertencem ao canal KAIRO
    const nonKairoUnitsRes = await pool.query(
      'SELECT id FROM content_units WHERE channel_id != $1',
      [KAIRO_CHANNEL_ID]
    );
    const nonKairoUnitIds = nonKairoUnitsRes.rows.map(r => r.id);

    console.log(`📌 Encontradas ${nonKairoUnitIds.length} unidades de conteúdo experimentais/teste.`);

    if (nonKairoUnitIds.length > 0) {
      // Deleta logs de publicação correspondentes
      await pool.query(
        'DELETE FROM publication_log WHERE content_id = ANY($1::uuid[])',
        [nonKairoUnitIds]
      );
      // Deleta transições correspondentes
      await pool.query(
        'DELETE FROM content_transitions WHERE content_id = ANY($1::uuid[])',
        [nonKairoUnitIds]
      );
      // Deleta as unidades
      await pool.query(
        'DELETE FROM content_units WHERE id = ANY($1::uuid[])',
        [nonKairoUnitIds]
      );
      console.log('✅ Unidades e tabelas vinculadas apagadas com sucesso.');
    }

    // 2. Apaga oportunidades que não são do canal KAIRO
    const oppDeleteRes = await pool.query(
      'DELETE FROM content_opportunities WHERE channel_id != $1',
      [KAIRO_CHANNEL_ID]
    );
    console.log(`✅ Oportunidades experimentais apagadas: ${oppDeleteRes.rowCount}`);

    // 3. Remove os outros canais da registry mantendo apenas KAIRO
    // GARANTIA EXPLÍCITA: O documento do canal KAIRO ("teleserie") é preservado.
    // O diretório físico "dna/" e o kairo_dna.json não são afetados, pois este script
    // interage exclusivamente com o banco de dados.
    const registryDeleteRes = await pool.query(
      "DELETE FROM channel_registry WHERE slug != 'teleserie'"
    );
    console.log(`✅ Canais de teste deletados do registro: ${registryDeleteRes.rowCount}`);

    console.log('🎉 Saneamento concluído! Apenas o canal KAIRO (@90kairo) e seus dados/documento foram mantidos. Arquivos físicos (como dna/) permanecem intocados.');
  } catch (err) {
    console.error('❌ Erro durante o saneamento:', err);
  } finally {
    await pool.end();
  }
}

sanitize().catch(console.error);
