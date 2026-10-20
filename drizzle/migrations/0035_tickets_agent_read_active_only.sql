DROP POLICY IF EXISTS "tickets agent read own" ON storage.objects;
CREATE POLICY "tickets agent read own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'candidate-photos' AND (storage.foldername(name))[1] = 'takamul' AND (storage.foldername(name))[2] = (auth.uid())::text AND public.is_active_account(auth.uid()));