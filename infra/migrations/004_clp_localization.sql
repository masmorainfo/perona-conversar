-- ============================================================
-- Content Localization Policy (CLP) — DB Migration
-- ============================================================
-- Adiciona suporte à política editorial CLP no banco de dados.
-- Idempotente: pode ser executado múltiplas vezes sem efeitos colaterais.

-- 1. Campo clp_result em normalized_signals
--    Armazena o CLPResult completo (decisões por termo) para auditoria
ALTER TABLE normalized_signals
  ADD COLUMN IF NOT EXISTS clp_result JSONB;

-- 2. Tabela localization_memory — Learning Engine
--    Registra decisões recorrentes. Quando occurrence_count supera um threshold,
--    o Signal Normalizer pode resolver sem chamar o LLM (lookup direto).
CREATE TABLE IF NOT EXISTS localization_memory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_term    TEXT NOT NULL,
  strategy         TEXT NOT NULL CHECK (strategy IN ('KEEP','TRANSLATE','ADAPT','EXPLAIN','REMOVE')),
  localized_form   TEXT NOT NULL DEFAULT '',
  reason           TEXT,
  cultural_context TEXT,                             -- enriquecido pelo Research Agent
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  channel_id       TEXT,                             -- NULL = memória global (cross-channel)
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (original_term, COALESCE(channel_id, ''))
);

COMMENT ON TABLE localization_memory IS
  'Memória editorial do Learning Engine. Termos com alta recorrência são resolvidos sem LLM.';
COMMENT ON COLUMN localization_memory.occurrence_count IS
  'Quantas vezes essa decisão foi confirmada no pipeline. Threshold para cache: > 10.';
COMMENT ON COLUMN localization_memory.channel_id IS
  'NULL = regra global (ex: Nintendo → KEEP). Não-NULL = regra específica do canal.';

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_locmem_term
  ON localization_memory (original_term);

CREATE INDEX IF NOT EXISTS idx_locmem_channel
  ON localization_memory (channel_id)
  WHERE channel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locmem_strategy
  ON localization_memory (strategy);

-- 4. Índice GIN para busca no clp_result JSONB
CREATE INDEX IF NOT EXISTS idx_signals_clp
  ON normalized_signals USING GIN (clp_result)
  WHERE clp_result IS NOT NULL;
