CREATE TABLE public.work_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.job_submissions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL DEFAULT 'general' CHECK (kind IN ('general','payment_received','payment_pending')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_notes_submission_idx ON public.work_notes(submission_id);
GRANT SELECT, INSERT ON public.work_notes TO authenticated;
GRANT ALL ON public.work_notes TO service_role;
ALTER TABLE public.work_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent add own work note" ON public.work_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.job_submissions s WHERE s.id = submission_id AND s.submitted_by = auth.uid()));
CREATE POLICY "agent read own work notes" ON public.work_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.job_submissions s WHERE s.id = submission_id AND s.submitted_by = auth.uid()));
CREATE POLICY "staff all work notes" ON public.work_notes FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));