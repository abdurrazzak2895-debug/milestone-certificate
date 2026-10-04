ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'management';

ALTER TABLE public.job_submissions
  ADD COLUMN IF NOT EXISTS candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secondary_mobile text,
  ADD COLUMN IF NOT EXISTS candidate_photo_path text,
  ADD COLUMN IF NOT EXISTS skill_details text,
  ADD COLUMN IF NOT EXISTS arrival_status text NOT NULL DEFAULT 'not_arrived',
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS secondary_mobile text,
  ADD COLUMN IF NOT EXISTS skill_details text,
  ADD COLUMN IF NOT EXISTS arrival_status text NOT NULL DEFAULT 'not_arrived',
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS submission_id uuid REFERENCES public.job_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result_last_checked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS exams_submission_id_unique
  ON public.exams(submission_id) WHERE submission_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_management_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin','staff','management')
  )
$$;

CREATE OR REPLACE FUNCTION public.link_approved_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  linked_candidate uuid;
  linked_exam uuid;
  local_exam_date date;
  local_exam_time time;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;

  SELECT id INTO linked_candidate
  FROM public.candidates
  WHERE upper(trim(passport_no)) = upper(trim(NEW.passport_no))
  ORDER BY created_at DESC
  LIMIT 1;

  IF linked_candidate IS NULL THEN
    INSERT INTO public.candidates(
      name, passport_no, mobile, secondary_mobile, occupation_id, ttc_id,
      photo_url, skill_details, arrival_status, received_at, received_by,
      result_check_at, notes
    ) VALUES (
      NEW.candidate_name, upper(trim(NEW.passport_no)), NEW.mobile,
      NEW.secondary_mobile, NEW.occupation_id, NEW.ttc_id,
      NEW.candidate_photo_path, NEW.skill_details, NEW.arrival_status,
      NEW.received_at, NEW.received_by, NEW.exam_at + interval '150 minutes',
      'এজেন্ট সাবমিশন #' || NEW.ref_no::text
    ) RETURNING id INTO linked_candidate;
  ELSE
    UPDATE public.candidates SET
      name = NEW.candidate_name,
      mobile = NEW.mobile,
      secondary_mobile = COALESCE(NEW.secondary_mobile, secondary_mobile),
      occupation_id = COALESCE(NEW.occupation_id, occupation_id),
      ttc_id = COALESCE(NEW.ttc_id, ttc_id),
      photo_url = COALESCE(NEW.candidate_photo_path, photo_url),
      skill_details = COALESCE(NEW.skill_details, skill_details),
      arrival_status = NEW.arrival_status,
      received_at = NEW.received_at,
      received_by = NEW.received_by,
      result_check_at = NEW.exam_at + interval '150 minutes'
    WHERE id = linked_candidate;
  END IF;

  local_exam_date := (NEW.exam_at AT TIME ZONE 'Asia/Dhaka')::date;
  local_exam_time := (NEW.exam_at AT TIME ZONE 'Asia/Dhaka')::time;

  INSERT INTO public.exams(
    candidate_id, exam_date, exam_time, ttc_id, occupation_id,
    exam_type, result, remarks, submission_id
  ) VALUES (
    linked_candidate, local_exam_date, local_exam_time, NEW.ttc_id,
    NEW.occupation_id, 'নিয়মিত',
    CASE WHEN NEW.svp_result IN ('PASS','FAIL') THEN NEW.svp_result::public.exam_result ELSE 'PENDING'::public.exam_result END,
    'এজেন্ট সাবমিশন #' || NEW.ref_no::text, NEW.id
  )
  ON CONFLICT (candidate_id, exam_date, occupation_id) DO UPDATE SET
    exam_time = EXCLUDED.exam_time,
    ttc_id = EXCLUDED.ttc_id,
    submission_id = EXCLUDED.submission_id
  RETURNING id INTO linked_exam;

  NEW.candidate_id := linked_candidate;
  NEW.exam_id := linked_exam;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS job_submissions_link_approved ON public.job_submissions;
CREATE TRIGGER job_submissions_link_approved
BEFORE INSERT OR UPDATE OF status, candidate_name, passport_no, mobile, secondary_mobile,
  occupation_id, ttc_id, exam_at, candidate_photo_path, skill_details,
  arrival_status, received_at, received_by
ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.link_approved_submission();

CREATE POLICY "management read submissions" ON public.job_submissions
FOR SELECT TO authenticated
USING (public.has_role_text(auth.uid(), 'management') AND public.is_active_account(auth.uid()));

CREATE POLICY "management read candidates" ON public.candidates
FOR SELECT TO authenticated
USING (public.has_role_text(auth.uid(), 'management') AND public.is_active_account(auth.uid()));

CREATE POLICY "management read exams" ON public.exams
FOR SELECT TO authenticated
USING (public.has_role_text(auth.uid(), 'management') AND public.is_active_account(auth.uid()));

CREATE POLICY "management read occupations" ON public.occupations
FOR SELECT TO authenticated
USING (public.has_role_text(auth.uid(), 'management') AND public.is_active_account(auth.uid()));

CREATE POLICY "management read ttc" ON public.ttc_centers
FOR SELECT TO authenticated
USING (public.has_role_text(auth.uid(), 'management') AND public.is_active_account(auth.uid()));

CREATE POLICY "management candidate photo upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'candidate-photos'
  AND (storage.foldername(name))[1] = 'candidates'
  AND public.has_role_text(auth.uid(), 'management')
  AND public.is_active_account(auth.uid())
);

CREATE POLICY "management candidate photo read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'candidate-photos'
  AND (storage.foldername(name))[1] = 'candidates'
  AND public.has_role_text(auth.uid(), 'management')
  AND public.is_active_account(auth.uid())
);

UPDATE public.job_submissions
SET status = status
WHERE status = 'approved';