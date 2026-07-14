-- ============================================================
-- COS — Migration 015: Add render pipeline states
-- ============================================================
-- Adds states required for the specific media and render steps.

ALTER TYPE content_state ADD VALUE IF NOT EXISTS 'MEDIA_SYNTHESIZED' AFTER 'PRODUCED';
ALTER TYPE content_state ADD VALUE IF NOT EXISTS 'RENDER_PENDING' AFTER 'MEDIA_SYNTHESIZED';
