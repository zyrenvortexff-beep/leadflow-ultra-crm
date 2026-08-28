CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove old job if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-messages-log');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule daily purge of messages older than 7 days
SELECT cron.schedule(
  'purge-old-messages-log',
  '15 3 * * *', -- daily at 03:15 UTC
  $$DELETE FROM public.messages_log WHERE timestamp < (now() - INTERVAL '7 days');$$
);