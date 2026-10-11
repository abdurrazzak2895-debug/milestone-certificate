CREATE TABLE public.receive_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.job_submissions(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receive_status_log_sub_idx ON public.receive_status_log(submission_id, changed_at DESC);
GRANT SELECT ON public.receive_status_log TO authenticated;
GRANT ALL ON public.receive_status_log TO service_role;
ALTER TABLE public.receive_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read receive log" ON public.receive_status_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "management read receive log" ON public.receive_status_log FOR SELECT TO authenticated USING (public.has_role_text(auth.uid(),'management') AND public.is_active_account(auth.uid()));
CREATE POLICY "agent read own receive log" ON public.receive_status_log FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.job_submissions s WHERE s.id = submission_id AND s.submitted_by = auth.uid()));
CREATE POLICY "provider read receive log" ON public.receive_status_log FOR SELECT TO authenticated USING (public.has_role_text(auth.uid(),'service_provider') AND public.is_active_account(auth.uid()) AND EXISTS (SELECT 1 FROM public.job_submissions s WHERE s.id = submission_id AND s.status='approved'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_submissions;