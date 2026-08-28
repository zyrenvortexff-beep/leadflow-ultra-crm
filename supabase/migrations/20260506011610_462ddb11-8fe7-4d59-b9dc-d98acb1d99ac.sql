ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS provider_message_id text;
CREATE INDEX IF NOT EXISTS idx_messages_log_provider_message_id ON public.messages_log(provider_message_id);