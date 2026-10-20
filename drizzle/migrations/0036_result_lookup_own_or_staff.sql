CREATE OR REPLACE FUNCTION public.check_applicant_result(_passport text, _occupation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; e record; _staff boolean; _mob text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status','auth_required');
  END IF;
  _staff := public.is_staff(auth.uid());
  _mob := public.current_customer_mobile();
  IF NOT _staff AND _mob IS NULL THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;
  SELECT * INTO c FROM candidates
   WHERE upper(trim(passport_no)) = upper(trim(_passport)) AND occupation_id = _occupation_id
     AND (_staff OR mobile = _mob OR secondary_mobile = _mob)
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
REVOKE EXECUTE ON FUNCTION public.check_applicant_result(text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.check_applicant_result(text, uuid) TO authenticated;