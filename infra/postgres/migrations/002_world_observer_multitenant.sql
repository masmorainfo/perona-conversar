-- ============================================================
-- COS — Migration 002: World Observer & Multitenancy
-- ============================================================

-- 1. Add org_id to channel_registry and content_units to support organizations/workspaces
ALTER TABLE channel_registry ADD COLUMN org_id UUID DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;
ALTER TABLE content_units ADD COLUMN org_id UUID DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL;

-- 2. Create raw_signals table
CREATE TABLE raw_signals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_name   TEXT NOT NULL,
  external_id   TEXT,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_raw_signals_sensor ON raw_signals(sensor_name);

-- 3. Create content_opportunities table
CREATE TYPE opportunity_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE content_opportunities (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  channel_id      UUID NOT NULL REFERENCES channel_registry(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  score           FLOAT NOT NULL,
  source_signals  JSONB NOT NULL, -- list of raw_signal IDs or references
  status          opportunity_status NOT NULL DEFAULT 'PENDING',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_opportunities_channel ON content_opportunities(channel_id, status);

CREATE TRIGGER trg_content_opportunities_updated_at
  BEFORE UPDATE ON content_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
