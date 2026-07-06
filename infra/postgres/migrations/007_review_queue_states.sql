-- ============================================================
-- COS — Migration 007: Add Review Queue states to content_state enum
-- ============================================================
-- Aligns the DB enum with the state machine (contentMachine)
-- which already uses PENDING_REVIEW and READY_TO_PUBLISH.
-- These states were added to @cos/types but never migrated to Postgres.

ALTER TYPE content_state ADD VALUE IF NOT EXISTS 'PENDING_REVIEW' AFTER 'QC_FAIL';
ALTER TYPE content_state ADD VALUE IF NOT EXISTS 'READY_TO_PUBLISH' AFTER 'PENDING_REVIEW';
