-- Add 'sent' to campaign_status enum (if not already)
DO $$ BEGIN
  ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'sent';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'leads',
  ADD COLUMN IF NOT EXISTS contact_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS manual_numbers text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
