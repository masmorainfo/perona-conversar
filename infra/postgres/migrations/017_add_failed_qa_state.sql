-- ============================================================
-- COS — Migration 017: Add FAILED_QA state
-- ============================================================
-- Adds state required for the technical video analysis step.

ALTER TYPE content_state ADD VALUE IF NOT EXISTS 'FAILED_QA' AFTER 'QC_FAIL';
