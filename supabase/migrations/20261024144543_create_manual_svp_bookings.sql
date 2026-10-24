-- Manual tracker only. No external SVP booking, cancellation, payment, or OTP action.
-- The confirmed target had no svp_bookings table before this additive migration.
BEGIN;

CREATE TABLE public.svp_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_name text NOT NULL CHECK (length(btrim(candidate_name)) BETWEEN 1 AND 200),
  passport text NOT NULL CHECK (passport ~ '^[A-Z0-9]{5,20}$'),
  occupation text CHECK (occupation IS NULL OR length(btrim(occupation)) BETWEEN 1 AND 200),
  center text CHECK (center IS NULL OR length(btrim(center)) BETWEEN 1 AND 200),
  exam_date date,
  exam_time text CHECK (exam_time IS NULL OR exam_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  agency text CHECK (agency IS NULL OR length(agency) <= 200),
  login_email text CHECK (login_email IS NULL OR length(login_email) <= 254),
  reference_no text CHECK (reference_no IS NULL OR length(reference_no) <= 100),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'booked', 'otp_pending', 'slip_done', 'cancelled', 'archived')),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX svp_bookings_exam_date_idx ON public.svp_bookings (exam_date, id);
CREATE INDEX svp_bookings_status_created_at_idx ON public.svp_bookings (status, created_at DESC);
CREATE INDEX svp_bookings_created_by_idx ON public.svp_bookings (created_by);

COMMENT ON TABLE public.svp_bookings IS
  'Admin/staff manual reservation tracker. A row is not an SVP reservation or proof of external booking/payment.';
COMMENT ON COLUMN public.svp_bookings.reference_no IS
  'Optional external reference transcribed by staff; never generated as an official SVP reference.';
COMMENT ON COLUMN public.svp_bookings.status IS
  'Manually recorded local status only. Changing this value never calls or cancels an external SVP reservation.';

-- Preserve creation metadata and timestamp every edit using the database clock.
CREATE FUNCTION public.svp_bookings_set_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := NEW.created_at;
  ELSE
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.svp_bookings_set_metadata() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER svp_bookings_metadata
  BEFORE INSERT OR UPDATE ON public.svp_bookings
  FOR EACH ROW EXECUTE FUNCTION public.svp_bookings_set_metadata();

ALTER TABLE public.svp_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY svp_bookings_select_admin_staff
  ON public.svp_bookings FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'staff'::public.app_role)
  );
CREATE POLICY svp_bookings_insert_admin_staff
  ON public.svp_bookings FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'staff'::public.app_role)
    )
  );
CREATE POLICY svp_bookings_update_admin_staff
  ON public.svp_bookings FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'staff'::public.app_role)
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'staff'::public.app_role)
  );

-- Archive via status instead of permanently deleting reservations from the client.
REVOKE ALL ON TABLE public.svp_bookings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.svp_bookings TO authenticated;
GRANT INSERT (
  candidate_name, passport, occupation, center, exam_date, exam_time,
  agency, login_email, reference_no, notes, status, created_by
) ON public.svp_bookings TO authenticated;
GRANT UPDATE (
  candidate_name, passport, occupation, center, exam_date, exam_time,
  agency, login_email, reference_no, notes, status
) ON public.svp_bookings TO authenticated;
GRANT ALL ON TABLE public.svp_bookings TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
