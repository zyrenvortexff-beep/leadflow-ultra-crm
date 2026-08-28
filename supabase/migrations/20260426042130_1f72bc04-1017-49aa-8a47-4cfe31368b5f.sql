WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY org_id ORDER BY updated_at DESC, created_at DESC, id DESC) AS rn
  FROM public.whatsapp_configs
)
DELETE FROM public.whatsapp_configs wc
USING ranked r
WHERE wc.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_configs_one_per_org
ON public.whatsapp_configs (org_id);