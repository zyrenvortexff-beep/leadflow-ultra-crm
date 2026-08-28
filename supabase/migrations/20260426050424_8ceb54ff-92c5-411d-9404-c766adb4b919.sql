CREATE OR REPLACE FUNCTION public.daily_limit_for_plan(_plan plan_type)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _plan::text
    WHEN 'trial' THEN 50
    WHEN 'vip'   THEN 500
    WHEN 'pro'   THEN 1000
    WHEN 'elite' THEN 2147483647
    ELSE 50
  END
$function$;