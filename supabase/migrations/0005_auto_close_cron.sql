-- Schedule auto_close_stale_sessions() every 30 minutes via pg_cron.
--
-- PREREQUISITE: pg_cron extension must be enabled in Supabase.
-- Enable it from the Supabase dashboard: Database → Extensions →
-- search "pg_cron" → toggle ON. Running this migration without pg_cron
-- enabled will fail at the cron.schedule call.
--
-- This is idempotent: if a job with the same name already exists, we
-- unschedule it first so this migration can be re-applied safely.

do $$
begin
  perform cron.unschedule('auto_close_stale_sessions');
exception when others then
  -- No existing schedule with this name; fine to proceed.
  null;
end $$;

select cron.schedule(
  'auto_close_stale_sessions',
  '*/30 * * * *',
  $$select public.auto_close_stale_sessions();$$
);
