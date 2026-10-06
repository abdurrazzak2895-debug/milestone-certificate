ALTER TABLE public.device_sessions ADD COLUMN IF NOT EXISTS prev_session_key text;

CREATE OR REPLACE FUNCTION public.claim_device_session(_key text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _admin boolean := public.has_role(auth.uid(), 'admin'::app_role);
BEGIN
  IF auth.uid() IS NULL OR length(_key) < 16 THEN RAISE EXCEPTION 'invalid'; END IF;
  INSERT INTO public.device_sessions(user_id, session_key, updated_at)
  VALUES (auth.uid(), _key, now())
  ON CONFLICT (user_id) DO UPDATE SET
    prev_session_key = CASE WHEN _admin THEN public.device_sessions.session_key ELSE NULL END,
    session_key = EXCLUDED.session_key, updated_at = now();
END $function$;

CREATE OR REPLACE FUNCTION public.is_current_device_session(_key text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT session_key = _key
      OR (prev_session_key = _key AND public.has_role(auth.uid(), 'admin'::app_role))
    FROM public.device_sessions WHERE user_id = auth.uid()), true)
$function$;