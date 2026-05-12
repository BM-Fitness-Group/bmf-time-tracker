-- Adds a project category to every clock-in. New entries (via the app)
-- require a category client-side; existing rows stay null and report as
-- "Uncategorized" until edited or replaced.
--
-- Category strings are validated against a TypeScript config in
-- src/lib/categories.ts — not enforced in the DB by enum/FK on purpose,
-- so renaming or adding categories doesn't require a schema migration.
-- If you ever decide categories should be managed in the admin UI rather
-- than a config file, promote this to a `categories` table with a FK.

alter table public.time_entries
  add column if not exists category text;

alter table public.active_sessions
  add column if not exists category text;
