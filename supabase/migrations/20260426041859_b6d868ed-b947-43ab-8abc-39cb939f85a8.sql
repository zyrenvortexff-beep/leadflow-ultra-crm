CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('campaigns-dispatch-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'campaigns-dispatch-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rgwndetlueztduqctsws.supabase.co/functions/v1/campaigns-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnd25kZXRsdWV6dGR1cWN0c3dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDY0MzEsImV4cCI6MjA5MjcyMjQzMX0.YX9AI-JStRet_M9pM9GMx99AGruty56W9SdFkY4uEAE',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnd25kZXRsdWV6dGR1cWN0c3dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDY0MzEsImV4cCI6MjA5MjcyMjQzMX0.YX9AI-JStRet_M9pM9GMx99AGruty56W9SdFkY4uEAE'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);