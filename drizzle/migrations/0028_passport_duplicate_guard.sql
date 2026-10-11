CREATE OR REPLACE FUNCTION public.passport_history(_passport text)
RETURNS TABLE(ref_code text, status text, svp_result text, exam_at timestamptz, created_at timestamptz, occupation text, blocking boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.ref_code, s.status, s.svp_result, s.exam_at, s.created_at,
         (SELECT name FROM occupations o WHERE o.id = s.occupation_id),
         (s.status <> 'rejected' AND s.svp_result <> 'FAIL')
  FROM job_submissions s
  WHERE auth.uid() IS NOT NULL AND upper(trim(s.passport_no)) = upper(trim(_passport))
  ORDER BY s.created_at DESC LIMIT 50
$$;
REVOKE ALL ON FUNCTION public.passport_history(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.passport_history(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.block_duplicate_passport()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM job_submissions s
             WHERE upper(trim(s.passport_no)) = upper(trim(NEW.passport_no))
               AND s.id <> NEW.id AND s.status <> 'rejected' AND s.svp_result <> 'FAIL') THEN
    RAISE EXCEPTION 'DUPLICATE_PASSPORT' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS job_submissions_block_dup ON public.job_submissions;
CREATE TRIGGER job_submissions_block_dup BEFORE INSERT ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.block_duplicate_passport();