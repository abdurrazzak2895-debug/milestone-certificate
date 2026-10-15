CREATE OR REPLACE FUNCTION public.check_applicant_result(_passport text, _occupation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; e record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status','auth_required');
  END IF;
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
REVOKE EXECUTE ON FUNCTION public.check_applicant_result(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_applicant_result(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.passport_history(_passport text)
RETURNS TABLE(ref_code text, status text, svp_result text, exam_at timestamptz, created_at timestamptz, occupation text, blocking boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.ref_code, s.status, s.svp_result, s.exam_at, s.created_at,
         (SELECT name FROM occupations o WHERE o.id = s.occupation_id),
         (s.status <> 'rejected' AND s.svp_result <> 'FAIL')
  FROM job_submissions s
  WHERE is_staff(auth.uid()) AND upper(trim(s.passport_no)) = upper(trim(_passport))
  ORDER BY s.created_at DESC LIMIT 50
$$;
GRANT EXECUTE ON FUNCTION public.passport_history(text) TO authenticated;