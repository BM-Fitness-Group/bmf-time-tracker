-- Auto-link employees.auth_user_id when a user completes magic-link auth.
-- Matches on employees.email. Pre-created employee rows (added by admin
-- via /admin/employees) must exist before the user's first sign-in,
-- otherwise the sign-in will succeed at the Supabase level but AuthCallback
-- will treat the user as unauthorized.
create or replace function public.link_employee_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employees
  set auth_user_id = new.id
  where email = new.email
    and auth_user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.link_employee_on_signup();

-- One-time admin seed. Safe to re-run; no-op if the row already exists.
-- Admin can sign in once this exists; the trigger above will link their
-- auth_user_id on the first magic-link completion.
insert into public.employees (email, full_name, role, is_active)
values ('jsoder@bodymachinefitness.com', 'Jeremy Soder', 'admin', true)
on conflict (email) do nothing;
