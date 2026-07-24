-- ============================================================
-- COS — Migration 019: Add QUEUE_ERROR state
-- ============================================================
-- This state is set by the Supervisor when dispatchNextAction
-- fails (e.g. Redis unreachable), making the failure visible
-- in the Pipeline Inspector instead of getting silently lost.
-- Without this value in the enum, the catch block in
-- eventHandler.ts would throw a secondary error, causing the
-- EDITORIAL_RESULT/EVALUATE_TRIGGER BullMQ jobs to land in
-- 'failed' and leaving units permanently stuck in their
-- previous state with no visibility.

ALTER TYPE content_state ADD VALUE IF NOT EXISTS 'QUEUE_ERROR' AFTER 'LEARNED';
