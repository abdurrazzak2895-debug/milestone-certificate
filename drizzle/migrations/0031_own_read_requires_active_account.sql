DROP POLICY "own read" ON public.job_submissions;
CREATE POLICY "own read" ON public.job_submissions
FOR SELECT TO authenticated
USING (submitted_by = auth.uid() AND is_active_account(auth.uid()));