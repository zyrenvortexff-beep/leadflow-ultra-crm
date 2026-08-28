ALTER TABLE public.messages_log REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_log;
  END IF;
END $$;