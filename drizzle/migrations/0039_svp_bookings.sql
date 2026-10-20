CREATE TABLE public.svp_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_name text NOT NULL,
  passport text NOT NULL,
  occupation text,
  center text,
  exam_date date,
  exam_time text,
  agency text,
  login_email text,
  status text NOT NULL DEFAULT 'booked',
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.svp_bookings TO authenticated;
GRANT ALL ON public.svp_bookings TO service_role;
ALTER TABLE public.svp_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all svp bookings" ON public.svp_bookings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));