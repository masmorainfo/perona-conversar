-- ============================================================
-- COS — Migration 008: Content Units Origin
--
-- Adiciona rastreabilidade de origem ao content_units.
-- Permite distinguir conteúdos iniciados autonomamente
-- (pelo Cycle Clock) de conteúdos iniciados manualmente
-- (pelo operador via CLI ou Mission Control).
--
-- Princípio da Dupla Entrada: ambas as origens convergem
-- para o mesmo pipeline operacional sem distinção de tratamento.
-- A diferença é apenas registrada para análise futura.
-- ============================================================

ALTER TABLE content_units
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual', 'cycle-clock', 'scheduler', 'api'));

COMMENT ON COLUMN content_units.origin IS
  'Origem da entrada: manual (operador via CLI/UI),
   cycle-clock (entrada autônoma pelo Cycle Clock),
   scheduler (entrada direta pelo Scheduler),
   api (integração externa).
   Preservado para rastreabilidade e análise futura.
   Não afeta o comportamento do pipeline.';

CREATE INDEX IF NOT EXISTS idx_content_units_origin ON content_units(origin);
