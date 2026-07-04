-- =========================================================
-- Migration 031: video worker horizontal scaling
-- =========================================================
-- Add worker_id so multiple workers can claim jobs safely
-- via SKIP LOCKED and report which worker is processing what.

alter table public.videos
  add column if not exists worker_id text,
  add column if not exists actualizado_en timestamptz not null default now();

-- Index for fast lookup of stuck jobs by worker
create index if not exists videos_worker_status_idx on public.videos(worker_id, status);
