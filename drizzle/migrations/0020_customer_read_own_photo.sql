CREATE POLICY "customer read own candidate photo" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'candidate-photos' AND public.current_customer_mobile() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.candidates c WHERE c.photo_url = objects.name
  AND right(regexp_replace(coalesce(c.mobile,''),'\D','','g'),11) = public.current_customer_mobile()));