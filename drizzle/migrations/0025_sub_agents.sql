ALTER TABLE public.agent_accounts ADD COLUMN IF NOT EXISTS parent_agent_id uuid;
CREATE INDEX IF NOT EXISTS agent_accounts_parent_idx ON public.agent_accounts(parent_agent_id);

CREATE OR REPLACE FUNCTION public.parent_agent_of(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT parent_agent_id FROM public.agent_accounts WHERE user_id = _user_id $$;

CREATE OR REPLACE FUNCTION public.set_sub_agent_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public.parent_agent_of(NEW.submitted_by) IS NOT NULL THEN
    IF NEW.status = 'pending_approval' THEN NEW.status := 'pending_agent'; END IF;
  ELSIF NEW.status = 'pending_agent' THEN
    NEW.status := 'pending_approval';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS job_submissions_sub_agent ON public.job_submissions;
CREATE TRIGGER job_submissions_sub_agent BEFORE INSERT ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_sub_agent_status();

DROP POLICY IF EXISTS "agent insert" ON public.job_submissions;
CREATE POLICY "agent insert" ON public.job_submissions FOR INSERT TO authenticated
WITH CHECK ((submitted_by = auth.uid()) AND (status IN ('pending_approval','pending_agent')) AND has_role_text(auth.uid(), 'agent') AND is_active_account(auth.uid()) AND (ticket_path LIKE ('takamul/' || auth.uid()::text || '/%')));

CREATE POLICY "parent agent read sub works" ON public.job_submissions FOR SELECT TO authenticated
USING (public.parent_agent_of(submitted_by) = auth.uid() AND is_active_account(auth.uid()));

DROP POLICY IF EXISTS "management read submissions" ON public.job_submissions;
CREATE POLICY "management read submissions" ON public.job_submissions FOR SELECT TO authenticated
USING (status <> 'pending_agent' AND has_role_text(auth.uid(), 'management') AND is_active_account(auth.uid()));

CREATE POLICY "parent read sub accounts" ON public.agent_accounts FOR SELECT TO authenticated
USING (parent_agent_id = auth.uid());

CREATE POLICY "parent read sub work notes" ON public.work_notes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.job_submissions s WHERE s.id = work_notes.submission_id AND public.parent_agent_of(s.submitted_by) = auth.uid()));

CREATE POLICY "parent read sub agent files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'candidate-photos' AND (storage.foldername(name))[1] IN ('takamul','candidate-drafts')
  AND public.parent_agent_of(((storage.foldername(name))[2])::uuid) = auth.uid());