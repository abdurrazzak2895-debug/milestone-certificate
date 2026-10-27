-- Core helper functions + missing enum for the reconstructed schema.
BEGIN;

DO $$
BEGIN
  IF to_regtype('public.exam_result') IS NULL THEN
    CREATE TYPE public.exam_result AS ENUM ('PENDING','PASS','FAIL','ABSENT','CANCELLED');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::public.app_role, 'staff'::public.app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_management_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'management'::public.app_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_account(_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_active boolean;
BEGIN
  SELECT active INTO v_active FROM public.agent_accounts WHERE user_id = _user_id;
  RETURN COALESCE(v_active, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.parent_agent_of(_user_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parent uuid;
BEGIN
  SELECT parent_agent_id INTO v_parent FROM public.agent_accounts WHERE user_id = _user_id;
  RETURN v_parent;
END;
$$;

CREATE OR REPLACE FUNCTION public.gen_ref_code()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'MC' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

CREATE OR REPLACE FUNCTION public.current_customer_mobile()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mobile text;
BEGIN
  SELECT mobile INTO v_mobile FROM public.agent_accounts WHERE user_id = auth.uid();
  IF v_mobile IS NOT NULL THEN RETURN v_mobile; END IF;
  SELECT split_part(email, '@', 1) INTO v_mobile FROM public.profiles WHERE id = auth.uid();
  RETURN v_mobile;
END;
$$;

CREATE TABLE IF NOT EXISTS public.cron_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cron_tokens ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.cron_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.verify_cron_token(_name text, _token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cron_tokens WHERE name = _name AND token = _token);
$$;

CREATE OR REPLACE FUNCTION public.claim_device_session(_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.device_sessions (user_id, session_key, updated_at)
  VALUES (v_uid, _key, now())
  ON CONFLICT (user_id) DO UPDATE
    SET prev_session_key = public.device_sessions.session_key,
        session_key = EXCLUDED.session_key,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_device_session(_key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.device_sessions
    WHERE user_id = auth.uid() AND session_key = _key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.candidate_fee_settled(_candidate_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.payments
    WHERE candidate_id = _candidate_id AND lower(coalesce(status, '')) IN ('paid','approved','settled')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_applicant_result(_passport text, _occupation_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row jsonb;
BEGIN
  SELECT to_jsonb(sub) INTO v_row FROM (
    SELECT ref_code, candidate_name, passport_no, occupation_id, svp_result, exam_at, status
    FROM public.job_submissions
    WHERE upper(regexp_replace(passport_no, '\s', '', 'g')) = upper(regexp_replace(_passport, '\s', '', 'g'))
      AND (occupation_id IS NULL OR occupation_id::text = _occupation_id OR _occupation_id = '')
    ORDER BY created_at DESC
    LIMIT 1
  ) sub;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.passport_history(_passport text)
RETURNS TABLE (
  blocking boolean,
  created_at timestamptz,
  exam_at timestamptz,
  occupation text,
  ref_code text,
  status text,
  svp_result text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT false, j.created_at, j.exam_at, o.name, j.ref_code, j.status, j.svp_result
  FROM public.job_submissions j
  LEFT JOIN public.occupations o ON o.id = j.occupation_id
  WHERE upper(regexp_replace(j.passport_no, '\s', '', 'g')) = upper(regexp_replace(_passport, '\s', '', 'g'))
  ORDER BY j.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_agent_contact()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object('name', a.full_name, 'mobile', a.mobile) INTO v
  FROM public.agent_accounts a
  WHERE a.user_id = (SELECT parent_agent_id FROM public.agent_accounts WHERE user_id = auth.uid())
  LIMIT 1;
  RETURN COALESCE(v, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_management_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_account(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.parent_agent_of(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gen_ref_code() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_customer_mobile() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_device_session(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_device_session(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_fee_settled(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_applicant_result(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.passport_history(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_agent_contact() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

