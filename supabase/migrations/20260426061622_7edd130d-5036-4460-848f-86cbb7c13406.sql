ALTER TABLE public.automations
ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.automations a
SET user_id = p.user_id
FROM public.profiles p
WHERE a.org_id = p.org_id
  AND a.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_automations_user_active
ON public.automations (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_automations_org_active
ON public.automations (org_id, is_active);

DROP POLICY IF EXISTS "Org access automations" ON public.automations;

CREATE POLICY "Org access automations"
ON public.automations
FOR ALL
TO authenticated
USING ((org_id = public.get_user_org(auth.uid())) OR public.is_superadmin(auth.uid()))
WITH CHECK ((org_id = public.get_user_org(auth.uid())) AND (user_id IS NULL OR user_id = auth.uid()));