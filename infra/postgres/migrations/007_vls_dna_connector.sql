-- ============================================================
-- Migration 007: VLS → DNA Connector
-- ============================================================
-- Adiciona suporte ao conector automático VLS → kairo_dna.json.
-- Idempotente: pode ser executado múltiplas vezes com segurança.

-- ─── Idempotência em vls_evidence_lab ────────────────────────────────────────

ALTER TABLE vls_evidence_lab
  ADD COLUMN IF NOT EXISTS applied_to_dna_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN vls_evidence_lab.applied_to_dna_at IS
  'Timestamp de quando este resultado SUCCESS foi aplicado ao kairo_dna.json
   pelo conector VLS→DNA (apply-to-dna.ts).
   NULL = ainda não processado ou não elegível.
   Garantia de idempotência: o conector filtra WHERE applied_to_dna_at IS NULL.';

-- ─── Log de auditoria de mutações de DNA ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS dna_mutation_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id         UUID NOT NULL REFERENCES vls_evidence_lab(id),
  hypothesis_id       TEXT NOT NULL,
  gene_category       TEXT NOT NULL,     -- ex: 'narrative_hook'
  gene_name           TEXT NOT NULL,     -- ex: 'existential_contradiction'
  maturity_from       TEXT NOT NULL,     -- maturidade anterior no DNA
  maturity_to         TEXT NOT NULL,     -- maturidade aplicada
  dna_version_before  TEXT NOT NULL,     -- campo "version" do kairo_dna.json antes da mutação
  backup_path         TEXT NOT NULL,     -- caminho absoluto do backup gerado antes da escrita
  dry_run             BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'APPLIED'
                      CHECK (status IN ('APPLIED', 'NO_CHANGE', 'UNMAPPED', 'BELOW_THRESHOLD')),
  notes               TEXT,             -- motivo quando status != APPLIED
  applied_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by          TEXT NOT NULL DEFAULT 'vls-dna-connector-v1'
);

COMMENT ON TABLE dna_mutation_log IS
  'Registro imutável de todas as mutações (e tentativas) do conector VLS→DNA.
   Cada linha representa uma decisão sobre um gene para um resultado de experimento.
   dry_run=TRUE indica simulação sem escrita real.';

CREATE INDEX IF NOT EXISTS idx_dna_mutation_log_hypothesis
  ON dna_mutation_log (hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_dna_mutation_log_gene
  ON dna_mutation_log (gene_category, gene_name);
CREATE INDEX IF NOT EXISTS idx_dna_mutation_log_evidence
  ON dna_mutation_log (evidence_id);
CREATE INDEX IF NOT EXISTS idx_dna_mutation_log_applied_at
  ON dna_mutation_log (applied_at DESC);
