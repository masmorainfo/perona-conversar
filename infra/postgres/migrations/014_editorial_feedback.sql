-- ============================================================
-- Migração 014: Tabela editorial_feedback
-- Armazena feedback qualitativo de rejeição editorial.
-- Categorias alinhadas ao AGENTS.md §6 (6 motivos padronizados).
-- ============================================================

-- ==================== UP ====================

-- ENUM com os 6 motivos padronizados de rejeição editorial
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'editorial_feedback_category') THEN
    CREATE TYPE editorial_feedback_category AS ENUM (
      'brand_mismatch',          -- Não representa a marca
      'artificial_narration',    -- Narração artificial
      'cinematic_direction',     -- Direção cinematográfica
      'inadequate_imagery',      -- Imagens inadequadas
      'bad_captions',            -- Legendas ruins
      'good_idea_bad_execution'  -- Boa ideia, má execução
    );
  END IF;
END
$$;

-- ENUM para a origem do feedback
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_source') THEN
    CREATE TYPE feedback_source AS ENUM (
      'telegram',
      'mission_control'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS editorial_feedback (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_unit_id UUID NOT NULL REFERENCES content_units(id) ON DELETE CASCADE,
  source          feedback_source NOT NULL DEFAULT 'telegram',
  category        editorial_feedback_category NOT NULL,
  free_text       TEXT,          -- contexto adicional opcional além da categoria
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas por unidade de conteúdo (VLS learning loop)
CREATE INDEX IF NOT EXISTS idx_editorial_feedback_content_unit
  ON editorial_feedback(content_unit_id);

-- Índice para agregação por categoria (análise de padrões de rejeição)
CREATE INDEX IF NOT EXISTS idx_editorial_feedback_category
  ON editorial_feedback(category);

-- ==================== DOWN ====================
-- Para reverter, executar manualmente:
--
--   DROP TABLE IF EXISTS editorial_feedback;
--   DROP TYPE IF EXISTS editorial_feedback_category;
--   DROP TYPE IF EXISTS feedback_source;
--
-- Nota: DROP TYPE só funciona se nenhuma outra tabela/coluna referencia o tipo.
