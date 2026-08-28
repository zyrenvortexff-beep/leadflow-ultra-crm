ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_configs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages_log;
ALTER TABLE public.whatsapp_configs REPLICA IDENTITY FULL;
ALTER TABLE public.messages_log REPLICA IDENTITY FULL;