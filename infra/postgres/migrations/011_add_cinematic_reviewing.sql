-- ============================================================
-- COS — Migration 011: Add CINEMATIC_REVIEWING to content_state enum
-- ============================================================
-- Aligns the DB enum with the state machine which uses CINEMATIC_REVIEWING.

ALTER TYPE content_state ADD VALUE IF NOT EXISTS 'CINEMATIC_REVIEWING' AFTER 'QC_FAIL';
