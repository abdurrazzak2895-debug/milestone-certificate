CREATE OR REPLACE FUNCTION public.sync_submission_result_to_exam()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.exam_id IS NOT NULL
     AND NEW.svp_result IN ('PASS','FAIL')
     AND NEW.svp_result IS DISTINCT FROM OLD.svp_result THEN
    UPDATE public.exams
    SET result = NEW.svp_result::public.exam_result,
        result_date = current_date,
        result_last_checked_at = COALESCE(NEW.svp_checked_at, now())
    WHERE id = NEW.exam_id;
  ELSIF NEW.exam_id IS NOT NULL
     AND NEW.svp_checked_at IS DISTINCT FROM OLD.svp_checked_at THEN
    UPDATE public.exams
    SET result_last_checked_at = NEW.svp_checked_at
    WHERE id = NEW.exam_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS job_submissions_sync_result ON public.job_submissions;
CREATE TRIGGER job_submissions_sync_result
AFTER UPDATE OF svp_result, svp_checked_at ON public.job_submissions
FOR EACH ROW EXECUTE FUNCTION public.sync_submission_result_to_exam();

CREATE POLICY "agent candidate photo upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'candidate-photos'
  AND (storage.foldername(name))[1] = 'candidate-drafts'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.has_role_text(auth.uid(), 'agent')
  AND public.is_active_account(auth.uid())
);

CREATE POLICY "agent candidate photo read own" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'candidate-photos'
  AND (storage.foldername(name))[1] = 'candidate-drafts'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.has_role_text(auth.uid(), 'agent')
  AND public.is_active_account(auth.uid())
);

CREATE POLICY "management read candidate drafts" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'candidate-photos'
  AND (storage.foldername(name))[1] = 'candidate-drafts'
  AND public.has_role_text(auth.uid(), 'management')
  AND public.is_active_account(auth.uid())
);