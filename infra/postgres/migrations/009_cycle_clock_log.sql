-- ============================================================
-- COS — Migration 009: Cycle Clock Log
--
-- Tabela de auditoria dos ciclos operacionais autônomos.
-- Registra cada disparo do Cycle Clock para rastreabilidade,
-- debugging e análise de cobertura ao longo do tempo.
-- ============================================================

CREATE TABLE IF NOT EXISTS cycle_clock_log (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channels_evaluated   INTEGER NOT NULL DEFAULT 0,  -- canais ativos consultados
  channels_triggered   INTEGER NOT NULL DEFAULT 0,  -- canais que tiveram oportunidade injetada
  opportunities_queued INTEGER NOT NULL DEFAULT 0,  -- total de content_units criados
  reason               TEXT,                        -- motivo do ciclo (scheduled | startup)
  metadata             JSONB NOT NULL DEFAULT '{}'  -- detalhes extras por canal
);

COMMENT ON TABLE cycle_clock_log IS
  'Log de auditoria dos ciclos autônomos do Cycle Clock.
   Um registro por execução de ciclo.
   Não afeta o comportamento operacional — serve apenas para observabilidade.';

CREATE INDEX IF NOT EXISTS idx_cycle_clock_log_started
  ON cycle_clock_log(cycle_started_at DESC);
