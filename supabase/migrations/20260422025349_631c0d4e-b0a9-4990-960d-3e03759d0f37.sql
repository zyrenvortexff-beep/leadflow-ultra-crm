-- Enable pg_cron + pg_net for scheduled invocation of campaigns-dispatch
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with same name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('campaigns-dispatch-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Run every minute, calls the campaigns-dispatch edge function
SELECT cron.schedule(
  'campaigns-dispatch-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ajdjxgdvavbfggnqtwyo.supabase.co/functions/v1/campaigns-dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZGp4Z2R2YXZiZmdnbnF0d3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTI5MTcsImV4cCI6MjA5MjM2ODkxN30.d07SX9FZxB7VYyqqayYTlw1nJbldCenytXes4B3EaJg"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);