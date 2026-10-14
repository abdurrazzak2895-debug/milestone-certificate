CREATE TABLE public.appointment_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.job_submissions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'needs_review',
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  old_exam_at timestamptz,
  verified_exam_at timestamptz,
  verified_reporting_time text,
  correction_reason text,
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.appointment_extractions(submission_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.appointment_extractions TO authenticated;
GRANT ALL ON public.appointment_extractions TO service_role;
ALTER TABLE public.appointment_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read extractions" ON public.appointment_extractions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin insert extractions" ON public.appointment_extractions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "admin update extractions" ON public.appointment_extractions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));