-- ============================================================
-- COS — Migration 001: Initial Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Channel Registry ────────────────────────────────────────────────────────

CREATE TABLE channel_registry (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT NOT NULL UNIQUE,           -- ex: "tech-br-001"
  name          TEXT NOT NULL,
  inherits_from TEXT,                           -- template slug, ex: "technology"
  core          JSONB NOT NULL,                 -- ChannelCore (immutable without approval)
  strategy      JSONB NOT NULL,                 -- ChannelStrategy (adaptive layer)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  priority      TEXT NOT NULL DEFAULT 'normal'  -- high | normal | low
                CHECK (priority IN ('high', 'normal', 'low')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE channel_registry_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id  UUID NOT NULL REFERENCES channel_registry(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  field       TEXT NOT NULL,                    -- 'core' | 'strategy'
  snapshot    JSONB NOT NULL,
  changed_by  TEXT NOT NULL,                    -- 'human' | 'learning_engine'
  reason      TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channel_registry_slug ON channel_registry(slug);
CREATE INDEX idx_channel_history_channel ON channel_registry_history(channel_id, changed_at DESC);

-- ─── Content State Machine ────────────────────────────────────────────────────

CREATE TYPE content_state AS ENUM (
  'DISCOVERED',
  'EVALUATED',
  'APPROVED',
  'REJECTED',
  'DEFERRED',
  'RESEARCHED',
  'SCRIPTED',
  'REVISED',
  'CRITIC_OK',
  'CRITIC_FAIL',
  'ABANDONED',
  'PRODUCED',
  'RENDERED',
  'QC_APPROVED',
  'QC_FAIL',
  'PUBLISHED',
  'PUBLISHED_PARTIAL',
  'ANALYZED',
  'LEARNED'
);

CREATE TABLE content_units (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id      UUID NOT NULL REFERENCES channel_registry(id) ON DELETE CASCADE,
  topic           TEXT NOT NULL,
  state           content_state NOT NULL DEFAULT 'DISCOVERED',
  metadata        JSONB NOT NULL DEFAULT '{}',  -- dados acumulados no pipeline
  attempt_counts  JSONB NOT NULL DEFAULT '{}',  -- { "CRITIC_FAIL": 0, "QC_FAIL": 0, ... }
  deferred_until  TIMESTAMPTZ,                  -- quando em DEFERRED
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE content_transitions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id    UUID NOT NULL REFERENCES content_units(id) ON DELETE CASCADE,
  from_state    content_state NOT NULL,
  to_state      content_state NOT NULL,
  actor         TEXT NOT NULL,                  -- qual agente/sistema fez a transição
  reason        TEXT,
  payload       JSONB,                          -- dados opcionais da transição
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_units_channel ON content_units(channel_id, state);
CREATE INDEX idx_content_units_state ON content_units(state);
CREATE INDEX idx_content_transitions_content ON content_transitions(content_id, transitioned_at DESC);

-- ─── Channel Memory (isolado por canal) ────────────────────────────────────────

CREATE TABLE channel_memory (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id  UUID NOT NULL REFERENCES channel_registry(id) ON DELETE CASCADE,
  topic       TEXT NOT NULL,
  angle       TEXT,
  content_id  UUID REFERENCES content_units(id),
  covered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ                       -- NULL = não expira
);

CREATE INDEX idx_channel_memory_channel ON channel_memory(channel_id, covered_at DESC);
CREATE INDEX idx_channel_memory_topic ON channel_memory USING gin(to_tsvector('portuguese', topic));

-- ─── World Knowledge (compartilhado entre canais) ──────────────────────────────

CREATE TABLE world_knowledge (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type       TEXT NOT NULL,              -- 'person' | 'company' | 'event' | 'product' | 'concept'
  entity_name       TEXT NOT NULL,
  facts             JSONB NOT NULL DEFAULT '{}',
  sources           JSONB NOT NULL DEFAULT '[]',
  embedding         vector(1536),               -- OpenAI text-embedding-3-small
  last_verified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,                -- NULL = não expira
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_world_knowledge_entity ON world_knowledge(entity_type, entity_name);
CREATE INDEX idx_world_knowledge_embedding ON world_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── Performance Index (isolado por canal, append-only) ────────────────────────

CREATE TABLE performance_index (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id   UUID NOT NULL REFERENCES channel_registry(id) ON DELETE CASCADE,
  content_id   UUID REFERENCES content_units(id),
  platform     TEXT NOT NULL,                   -- 'youtube' | 'tiktok' | 'instagram'
  metric_type  TEXT NOT NULL,                   -- 'views' | 'ctr' | 'retention' | 'watch_time' | 'shares'
  value        FLOAT NOT NULL,
  signal_tier  TEXT NOT NULL                    -- 'short' | 'mid' | 'long'
               CHECK (signal_tier IN ('short', 'mid', 'long')),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_performance_channel_platform ON performance_index(channel_id, platform, recorded_at DESC);
CREATE INDEX idx_performance_signal_tier ON performance_index(channel_id, signal_tier, recorded_at DESC);

-- ─── Publication Log ──────────────────────────────────────────────────────────

CREATE TABLE publication_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id    UUID NOT NULL REFERENCES content_units(id) ON DELETE CASCADE,
  channel_id    UUID NOT NULL REFERENCES channel_registry(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  status        TEXT NOT NULL                   -- 'success' | 'failed' | 'retrying'
                CHECK (status IN ('success', 'failed', 'retrying')),
  attempt       INTEGER NOT NULL DEFAULT 1,
  platform_url  TEXT,                           -- URL do conteúdo publicado
  error_message TEXT,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_publication_log_content ON publication_log(content_id, platform);

-- ─── Triggers: updated_at automático ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_channel_registry_updated_at
  BEFORE UPDATE ON channel_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_content_units_updated_at
  BEFORE UPDATE ON content_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
