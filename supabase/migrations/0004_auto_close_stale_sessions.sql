-- Safety hard-cap for forgotten clock-outs. When a session stays active
-- longer than 14 hours (covering an overnight forget, say, someone clocked
-- in at 6am and nobody clocked out), close it automatically at the 14-hour
-- mark and flag the entry for admin review via the appended note marker and
-- an 'auto_clockout' audit_log entry.
--
-- Runs as SECURITY DEFINER so cron (which has no auth context) can execute
-- it. Owned by postgres (BYPASSRLS) so it can write across all employees.

create or replace function public.auto_close_stale_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stale record;
  cap_hours constant interval := interval '14 hours';
  marker constant text := '[Auto-closed at 14h cap — review]';
  new_entry_id uuid;
  closed_count integer := 0;
begin
  for stale in
    select *
    from public.active_sessions
    where clock_in < now() - cap_hours
  loop
    insert into public.time_entries (
      employee_id,
      entity,
      clock_in,
      clock_out,
      break_minutes,
      notes,
      is_manual,
      is_approved,
      clock_in_location,
      clock_out_location
    )
    values (
      stale.employee_id,
      stale.entity,
      stale.clock_in,
      stale.clock_in + cap_hours,
      stale.break_minutes,
      case
        when stale.notes is null or btrim(stale.notes) = '' then marker
        else stale.notes || ' | ' || marker
      end,
      false,
      false,
      null,
      null
    )
    returning id into new_entry_id;

    delete from public.active_sessions
    where employee_id = stale.employee_id;

    insert into public.audit_log (
      actor_id,
      action,
      target_type,
      target_id,
      details
    )
    values (
      null,
      'auto_clockout',
      'time_entry',
      new_entry_id,
      jsonb_build_object(
        'employee_id', stale.employee_id,
        'entity', stale.entity,
        'session_started', stale.clock_in,
        'capped_at_hours', 14
      )
    );

    closed_count := closed_count + 1;
  end loop;

  return closed_count;
end;
$$;

-- Grant execute so the pg_cron scheduler (which runs under the postgres role
-- anyway) is explicit; no side effect in the default Supabase setup.
grant execute on function public.auto_close_stale_sessions() to postgres;
