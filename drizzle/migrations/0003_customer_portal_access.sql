CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.current_customer_mobile()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN (auth.jwt() ->> 'email') ~ '^8801[3-9][0-9]{8}@phone\.login\.local$'
    THEN substring(auth.jwt() ->> 'email' from 3 for 11) ELSE NULL END
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['candidates','exams','occupations','ttc_centers','results','reminders','settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "staff all" ON public.%I', t);
    EXECUTE format('CREATE POLICY "staff all" ON public.%I FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()))', t);
  END LOOP;
END $$;

CREATE POLICY "customer own candidate" ON public.candidates FOR SELECT TO authenticated
  USING (public.current_customer_mobile() IS NOT NULL AND right(regexp_replace(coalesce(mobile,''), '\D', '', 'g'), 11) = public.current_customer_mobile());

CREATE POLICY "customer own exams" ON public.exams FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id
    AND public.current_customer_mobile() IS NOT NULL
    AND right(regexp_replace(coalesce(c.mobile,''), '\D', '', 'g'), 11) = public.current_customer_mobile()));

CREATE POLICY "customer read occupations" ON public.occupations FOR SELECT TO authenticated USING (true);
CREATE POLICY "customer read ttc" ON public.ttc_centers FOR SELECT TO authenticated USING (true);