-- ============================================================
-- COS — Migration 012: Add STORYBOARD_PLANNED to content_state enum
-- ============================================================
-- Aligns the DB enum with the state machine which uses STORYBOARD_PLANNED.

ALTER TYPE content_state ADD VALUE IF NOT EXISTS 'STORYBOARD_PLANNED' AFTER 'CRITIC_OK';
