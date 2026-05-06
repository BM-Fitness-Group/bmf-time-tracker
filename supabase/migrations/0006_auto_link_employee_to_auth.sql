-- Self-healing employee/auth linking.
--
-- The original trigger (0002) fires on auth.users INSERT and links the new
-- auth user to a matching pre-existing employees row by email. That works
-- when the admin adds the employee first, then the user signs in.
--
-- The reverse case wasn't covered: if a user tries to sign in BEFORE the
-- admin has added them, an auth.users row gets created but no employees
-- row exists yet. When the admin later adds them, the new employees row
-- has auth_user_id=null forever — the user can never sign in because the
-- app keys all auth on auth_user_id.
--
-- This trigger fixes that gap. On every insert into employees (and on
-- update if email changes), if auth_user_id is null we look up
-- auth.users by email and fill it in. BEFORE INSERT/UPDATE so we modify
-- NEW directly without recursing back into ourselves.

create or replace function public.link_employee_on_employee_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is null and new.email is not null then
    new.auth_user_id := (
      select id from auth.users
      where lower(email) = lower(new.email)
      limit 1
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_employee_change on public.employees;
create trigger on_employee_change
before insert or update of email, auth_user_id on public.employees
for each row execute function public.link_employee_on_employee_change();

-- One-time backfill: link anyone we already missed.
update public.employees e
set auth_user_id = u.id
from auth.users u
where lower(e.email) = lower(u.email) and e.auth_user_id is null;
