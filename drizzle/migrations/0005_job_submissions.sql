CREATE TABLE public.job_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no bigint GENERATED ALWAYS AS IDENTITY,
  submitted_by uuid NOT NULL DEFAULT auth.uid(),
  passport_no text NOT NULL,
  candidate_name text NOT NULL,
  mobile text NOT NULL,
  ttc_id uuid REFERENCES public.ttc_centers(id),
  exam_at timestamptz NOT NULL,
  education text NOT NULL CHECK (education IN ('educated','uneducated')),
  experience text NOT NULL CHECK (experience IN ('yes','no')),
  ticket_path text NOT NULL,
  terms_accepted boolean NOT NULL CHECK (terms_accepted),
  status text NOT NULL DEFAULT 'pending_approval',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.job_submissions TO authenticated;
GRANT ALL ON public.job_submissions TO service_role;
ALTER TABLE public.job_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insert" ON public.job_submissions FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid() AND status = 'pending_approval');
CREATE POLICY "own read" ON public.job_submissions FOR SELECT TO authenticated USING (submitted_by = auth.uid());
CREATE POLICY "staff all" ON public.job_submissions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
GRANT UPDATE, DELETE ON public.job_submissions TO authenticated;