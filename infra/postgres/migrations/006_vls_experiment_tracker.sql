-- ============================================================
-- VLS — Migration 006: Experiment Tracker + Evidence Lab
-- ============================================================
-- Adiciona suporte ao ciclo científico do Video Language System.
-- O VLS usa a mesma infraestrutura de banco do COS, mas com
-- tabelas próprias para não contaminar o pipeline editorial.
-- Idempotente: pode ser executado múltiplas vezes.

-- ─── Experimentos VLS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vls_experiments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id     TEXT NOT NULL,        -- ex: 'ATT-HIP-001'
  department        TEXT NOT NULL,        -- ex: 'ATTENTION'
  title             TEXT NOT NULL,        -- descrição humana do experimento
  manipulated_var   TEXT NOT NULL,        -- o que foi intencionalmente alterado
  controlled_vars   TEXT NOT NULL,        -- o que foi mantido constante
  primary_metric    TEXT NOT NULL,        -- ex: 'three_second_view_rate'
  success_criterion TEXT NOT NULL,        -- ex: '>10% vs baseline'
  failure_criterion TEXT NOT NULL,        -- ex: '<5% ou direção oposta'
  inconclusive_zone TEXT NOT NULL,        -- ex: 'entre 5% e 10%'
  guardrails        JSONB NOT NULL DEFAULT '[]',  -- métricas que não podem cair
  secondary_metrics JSONB NOT NULL DEFAULT '[]',  -- métricas observadas
  min_views_per_variant INTEGER NOT NULL DEFAULT 5000,
  platform          TEXT NOT NULL         -- 'tiktok' | 'youtube' | 'instagram'
                    CHECK (platform IN ('tiktok', 'youtube', 'instagram')),
  period_start      DATE,
  period_end        DATE,
  status            TEXT NOT NULL DEFAULT 'PLANNED'
                    CHECK (status IN ('PLANNED', 'RUNNING', 'COMPLETED', 'SUSPENDED')),
  -- Dados do baseline calculado antes do experimento
  baseline_value    FLOAT,               -- valor baseline da métrica primária
  baseline_source   TEXT,               -- como foi calculado (ex: 'últimos 10 vídeos')
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vls_experiments IS
  'Registro de experimentos científicos do VLS. Cada experimento testa uma hipótese formalizada.';
COMMENT ON COLUMN vls_experiments.hypothesis_id IS
  'Referência à hipótese no documento VLS_Research_Attention_v1.md. Ex: ATT-HIP-001';
COMMENT ON COLUMN vls_experiments.guardrails IS
  'Array de {metric, max_drop_pct}. Se qualquer guardrail for violado, experimento é suspenso.';

CREATE INDEX IF NOT EXISTS idx_vls_experiments_hypothesis
  ON vls_experiments (hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_vls_experiments_status
  ON vls_experiments (status);

-- Trigger para updated_at automático
CREATE TRIGGER trg_vls_experiments_updated_at
  BEFORE UPDATE ON vls_experiments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Vídeos do Experimento (variantes) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS vls_experiment_videos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   UUID NOT NULL REFERENCES vls_experiments(id) ON DELETE CASCADE,
  content_id      UUID REFERENCES content_units(id),  -- link ao pipeline COS
  variant_label   TEXT NOT NULL,        -- 'A' | 'B' | 'control'
  variant_desc    TEXT NOT NULL,        -- descrição do que esta variante representa
  platform_url    TEXT,                 -- URL real após publicação
  published_at    TIMESTAMPTZ,
  -- Métricas coletadas para esta variante (preenchidas no encerramento)
  metrics_raw     JSONB DEFAULT '{}',   -- dados brutos da plataforma
  metrics_collected_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vls_experiment_videos IS
  'Vídeos que compõem um experimento VLS. Cada experimento tem ao menos 2 variantes.';
COMMENT ON COLUMN vls_experiment_videos.variant_label IS
  'A = variante com estímulo testado. B = variante de controle (ou comparação).';
COMMENT ON COLUMN vls_experiment_videos.metrics_raw IS
  'JSON com todas as métricas coletadas: {three_second_rate, avg_watch_time, completion_rate, shares, likes, comments}';

CREATE INDEX IF NOT EXISTS idx_vls_experiment_videos_experiment
  ON vls_experiment_videos (experiment_id);
CREATE INDEX IF NOT EXISTS idx_vls_experiment_videos_content
  ON vls_experiment_videos (content_id) WHERE content_id IS NOT NULL;

-- ─── Evidence Lab (resultados interpretados) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS vls_evidence_lab (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id         UUID NOT NULL REFERENCES vls_experiments(id) ON DELETE CASCADE,
  
  -- Resultado quantitativo
  variant_a_value       FLOAT NOT NULL,   -- valor da métrica primária na variante A
  variant_b_value       FLOAT,            -- valor da métrica primária na variante B (se houver)
  baseline_value        FLOAT,            -- baseline calculado antes do experimento
  delta_vs_baseline_pct FLOAT,            -- variação % vs baseline (variante A)
  delta_a_vs_b_pct      FLOAT,            -- variação % entre A e B

  -- Guardrails
  guardrail_violations  JSONB NOT NULL DEFAULT '[]',  -- lista de guardrails violados

  -- Decisão formal (determinada pelos critérios pré-declarados, não por interpretação)
  outcome               TEXT NOT NULL
                        CHECK (outcome IN ('SUCCESS', 'FAILURE', 'INCONCLUSIVE', 'SUSPENDED')),
  
  -- Atualização da hipótese
  hypothesis_prev_state TEXT NOT NULL,    -- estado antes do experimento
  hypothesis_new_state  TEXT NOT NULL,    -- estado após o resultado

  -- Interpretação científica
  interpretation        TEXT NOT NULL,    -- o que o resultado significa
  limitations           TEXT NOT NULL,    -- explicações alternativas e limitações
  secondary_observations TEXT,            -- movimentos observados nas métricas secundárias
  
  -- Próximos passos
  next_hypothesis       TEXT,             -- hipótese gerada a partir deste resultado
  
  closed_by             TEXT NOT NULL DEFAULT 'vls-experiment-close',  -- quem fechou
  closed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vls_evidence_lab IS
  'Resultados interpretados de experimentos VLS. É o guardião da Lei Zero — nenhum resultado entra sem critério pré-declarado.';
COMMENT ON COLUMN vls_evidence_lab.outcome IS
  'Determinado automaticamente pelos critérios de sucesso/falha declarados ANTES do experimento. Nunca por interpretação posterior.';
COMMENT ON COLUMN vls_evidence_lab.hypothesis_new_state IS
  'Estado atualizado da hipótese: Hipótese|Padrão Emergente|Lei Validada|Refutada|Em Revisão';

CREATE INDEX IF NOT EXISTS idx_vls_evidence_lab_experiment
  ON vls_evidence_lab (experiment_id);
CREATE INDEX IF NOT EXISTS idx_vls_evidence_lab_outcome
  ON vls_evidence_lab (outcome);
CREATE INDEX IF NOT EXISTS idx_vls_evidence_lab_hypothesis
  ON vls_evidence_lab (hypothesis_prev_state, hypothesis_new_state);
