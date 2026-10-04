CREATE POLICY "management update approved submissions" ON public.job_submissions
FOR UPDATE TO authenticated
USING (
  status = 'approved'
  AND public.has_role_text(auth.uid(), 'management')
  AND public.is_active_account(auth.uid())
)
WITH CHECK (
  status = 'approved'
  AND public.has_role_text(auth.uid(), 'management')
  AND public.is_active_account(auth.uid())
);