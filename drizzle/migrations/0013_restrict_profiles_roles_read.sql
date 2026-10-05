DROP POLICY IF EXISTS "profiles read" ON public.profiles;
CREATE POLICY "profiles own or staff read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "roles read" ON public.user_roles;
CREATE POLICY "roles own or staff read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));