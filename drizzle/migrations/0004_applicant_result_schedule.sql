ALTER TABLE public.occupations ADD COLUMN IF NOT EXISTS svp_key text UNIQUE, ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.ttc_centers ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS result_check_at timestamptz, ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS candidates_touch ON public.candidates;
CREATE TRIGGER candidates_touch BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT ON public.occupations TO anon;
CREATE POLICY "public read active occupations" ON public.occupations FOR SELECT TO anon USING (active);

CREATE OR REPLACE FUNCTION public.check_applicant_result(_passport text, _occupation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; e record;
BEGIN
  SELECT * INTO c FROM candidates
   WHERE upper(trim(passport_no)) = upper(trim(_passport)) AND occupation_id = _occupation_id
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF c.result_check_at IS NULL OR now() < c.result_check_at THEN
    RETURN jsonb_build_object('status','pending','result_check_at',c.result_check_at);
  END IF;
  SELECT * INTO e FROM exams WHERE candidate_id = c.id ORDER BY exam_date DESC, created_at DESC LIMIT 1;
  RETURN jsonb_build_object('status','available',
    'name',c.name,'passport_no',c.passport_no,
    'occupation',(SELECT name FROM occupations WHERE id=c.occupation_id),
    'ttc',(SELECT name FROM ttc_centers WHERE id=c.ttc_id),
    'exam_date',e.exam_date,'result',COALESCE(e.result::text,'PENDING'));
END $$;
REVOKE ALL ON FUNCTION public.check_applicant_result(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.check_applicant_result(text, uuid) TO anon, authenticated;