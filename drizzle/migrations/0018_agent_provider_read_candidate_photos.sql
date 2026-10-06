CREATE POLICY "agent read own submission photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'candidate-photos' AND (storage.foldername(name))[1] = 'candidates'
  AND EXISTS (SELECT 1 FROM public.job_submissions s WHERE s.id::text = (storage.foldername(name))[2] AND s.submitted_by = auth.uid()));
CREATE POLICY "provider read approved submission photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'candidate-photos' AND public.has_role_text(auth.uid(), 'service_provider') AND public.is_active_account(auth.uid())
  AND EXISTS (SELECT 1 FROM public.job_submissions s WHERE s.status = 'approved' AND s.candidate_photo_path = storage.objects.name));