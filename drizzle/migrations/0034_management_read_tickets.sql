create policy "tickets management read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'candidate-photos'
  and (storage.foldername(name))[1] = 'takamul'
  and public.has_role_text(auth.uid(), 'management')
  and public.is_active_account(auth.uid())
);