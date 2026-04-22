-- Track accumulated break time on the active session, so consecutive
-- breaks within a single shift sum correctly and survive a refresh.
-- break_start marks the current open break; break_minutes holds the
-- total completed break minutes so far. On clock-out, any open break is
-- finalized and the total is copied to time_entries.break_minutes.
alter table public.active_sessions
  add column if not exists break_minutes integer not null default 0;
