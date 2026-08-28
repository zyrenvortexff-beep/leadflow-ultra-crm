
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS link_regalo text;

ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS automation_id uuid;
ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS recipient text;
ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.messages_log ADD COLUMN IF NOT EXISTS keyword_matched text;

-- lead_id and content are NOT NULL in original schema for messages_log -- relax for system logs
ALTER TABLE public.messages_log ALTER COLUMN content DROP NOT NULL;
