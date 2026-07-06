-- ============================================================
-- COS — Migration 004: Opportunity Model
-- ============================================================

-- 1. Add new states to opportunity_status ENUM
ALTER TYPE opportunity_status ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE opportunity_status ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE opportunity_status ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE opportunity_status ADD VALUE IF NOT EXISTS 'DISCARDED';

-- 2. Rename score to base_score and add dynamic_score
ALTER TABLE content_opportunities RENAME COLUMN score TO base_score;
ALTER TABLE content_opportunities ADD COLUMN dynamic_score FLOAT;
