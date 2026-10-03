CREATE TABLE public.agent_accounts (
  user_id uuid PRIMARY KEY,
  agent_code text UNIQUE,
  full_name text NOT NULL,
  mobile text NOT NULL,
  role public.app_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_accounts TO authenticated;
GRANT ALL ON public.agent_accounts TO service_role;
ALTER TABLE public.agent_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own read" ON public.agent_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "staff read" ON public.agent_accounts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_active_account(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT active FROM public.agent_accounts WHERE user_id = _user_id), true) $$;

CREATE OR REPLACE FUNCTION public.has_role_text(_user_id uuid, _role text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role) $$;

ALTER TABLE public.job_submissions
  ADD COLUMN occupation_id uuid REFERENCES public.occupations(id),
  ADD COLUMN rejection_reason text,
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN svp_result text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN svp_checked_at timestamptz;

DROP POLICY IF EXISTS "own insert" ON public.job_submissions;
CREATE POLICY "agent insert" ON public.job_submissions FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND status = 'pending_approval' AND public.has_role_text(auth.uid(),'agent') AND public.is_active_account(auth.uid()) AND ticket_path LIKE 'takamul/' || auth.uid()::text || '/%');
CREATE POLICY "provider read approved" ON public.job_submissions FOR SELECT TO authenticated
  USING (status = 'approved' AND public.has_role_text(auth.uid(),'service_provider') AND public.is_active_account(auth.uid()));

DROP POLICY IF EXISTS "photos read" ON storage.objects;
DROP POLICY IF EXISTS "photos write" ON storage.objects;
DROP POLICY IF EXISTS "photos update" ON storage.objects;
CREATE POLICY "photos staff all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='candidate-photos' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id='candidate-photos' AND public.is_staff(auth.uid()));
CREATE POLICY "tickets agent upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='candidate-photos' AND (storage.foldername(name))[1]='takamul' AND (storage.foldername(name))[2]=auth.uid()::text AND public.has_role_text(auth.uid(),'agent'));
CREATE POLICY "tickets agent read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='candidate-photos' AND (storage.foldername(name))[1]='takamul' AND (storage.foldername(name))[2]=auth.uid()::text);