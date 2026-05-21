-- Soft delete for time entries (the "Trash" / recycle-bin feature).
--
-- Instead of a hard DELETE, the app now stamps deleted_at = now(). The
-- row stays in the table but is filtered out of every normal view by a
-- "deleted_at is null" clause. An admin Trash page lists deleted rows
-- and can restore them (deleted_at = null) or permanently remove them.
--
-- Bonus: soft delete is an UPDATE, not a DELETE, so it runs under the
-- existing time_entries_update_own RLS policy — no separate delete
-- policy needed for the common case. Permanent removal from the Trash
-- is still a real DELETE and remains admin-only.

alter table public.time_entries
  add column if not exists deleted_at timestamptz;

-- Partial index: only the (few) deleted rows are indexed, keeping the
-- Trash query fast without bloating the main hot path.
create index if not exists idx_time_entries_deleted_at
  on public.time_entries (deleted_at)
  where deleted_at is not null;
