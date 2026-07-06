-- ============================================================
-- COS — Migration 003: Normalized Signals for World Observer
-- ============================================================

CREATE TABLE IF NOT EXISTS normalized_signals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source        TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  url           TEXT,
  score         FLOAT NOT NULL,
  raw_signal_id UUID REFERENCES raw_signals(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_normalized_signals_created_at ON normalized_signals(created_at DESC);
