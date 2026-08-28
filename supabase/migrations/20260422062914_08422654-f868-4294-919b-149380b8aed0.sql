-- Remove any prior schedule to keep this idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('campaigns-dispatch-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'campaigns-dispatch-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url:='https://flrmhwyhvomufazgouxg.supabase.co/functions/v1/campaigns-dispatch',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZscm1od3lodm9tdWZhemdvdXhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MjYzMjYsImV4cCI6MjA5MjQwMjMyNn0.XjHC2242A1SyDChn2WO9m0OklKgw1ddzfNs_qHM-NYc"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $cron$
);