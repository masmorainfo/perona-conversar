-- ============================================================
-- COS — Migration 005: Opportunity Health Metrics
-- ============================================================

-- Add new metrics for Dynamic Score (Holistic Health Assessment)
ALTER TABLE content_opportunities ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'NORMAL';
ALTER TABLE content_opportunities ADD COLUMN IF NOT EXISTS source_count INTEGER DEFAULT 1;
ALTER TABLE content_opportunities ADD COLUMN IF NOT EXISTS geographic_expansion FLOAT DEFAULT 0.0;
ALTER TABLE content_opportunities ADD COLUMN IF NOT EXISTS editorial_compatibility FLOAT DEFAULT 1.0;
ALTER TABLE content_opportunities ADD COLUMN IF NOT EXISTS momentum FLOAT DEFAULT 0.0;
