CREATE OR REPLACE FUNCTION public.daily_limit_for_plan(_plan public.plan_type)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _plan::text
    WHEN 'trial' THEN 10
    WHEN 'vip'   THEN 150
    WHEN 'pro'   THEN 200
    WHEN 'elite' THEN 2147483647
    ELSE 10
  END
$$;