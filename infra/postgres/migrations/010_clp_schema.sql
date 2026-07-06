-- ============================================================
-- COS — Migration 010: CLP Schema Updates & Localization Memory
-- ============================================================

-- 1. Adicionar campos ausentes ao normalized_signals para persistência do CLP
ALTER TABLE normalized_signals 
ADD COLUMN IF NOT EXISTS original_title TEXT,
ADD COLUMN IF NOT EXISTS detected_lang  TEXT,
ADD COLUMN IF NOT EXISTS clp_result     JSONB;

-- 2. Criar a tabela de cache/memória local de tradução CLP
CREATE TABLE IF NOT EXISTS localization_memory (
  id               SERIAL PRIMARY KEY,
  channel_id       TEXT DEFAULT '',
  original_term    TEXT NOT NULL,
  strategy         TEXT NOT NULL,
  localized_form   TEXT,
  reason           TEXT,
  occurrence_count INT NOT NULL DEFAULT 1,
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_localization_memory UNIQUE (original_term, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_localization_memory_term ON localization_memory(original_term);
