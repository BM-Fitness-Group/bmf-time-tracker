-- Lock down manual time entries to admins only.
--
-- A non-admin staff member should never be able to create a backdated
-- entry (is_manual = true). The UI now hides the manual-entry button for
-- non-admins, but a determined bad actor with access to the browser
-- bundle could still call the API directly. This RLS policy enforces it
-- at the database — even a direct Supabase API call will be rejected if
-- a non-admin tries to insert with is_manual = true.
--
-- The original "time_entries_insert_own" policy permitted any insert by
-- the row's owner. We replace it with one that adds the additional
-- constraint that non-admins can only insert is_manual = false rows.
-- Admins retain full insert ability.

drop policy if exists "time_entries_insert_own" on public.time_entries;

create policy "time_entries_insert_own" on public.time_entries
for insert
with check (
  (employee_id = current_employee_id() and is_manual = false)
  or is_admin()
);
