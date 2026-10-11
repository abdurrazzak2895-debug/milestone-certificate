CREATE OR REPLACE FUNCTION public.candidate_fee_settled(_candidate_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT c.fee_amount <= 0 OR COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.candidate_id = c.id AND p.status = 'approved'),0) >= c.fee_amount
    FROM candidates c WHERE c.id = _candidate_id), false)
$$;

DROP POLICY IF EXISTS "customer own exams" ON public.exams;
CREATE POLICY "customer own exams" ON public.exams FOR SELECT TO authenticated USING (
  public.candidate_fee_settled(exams.candidate_id) AND EXISTS (SELECT 1 FROM candidates c
    WHERE c.id = exams.candidate_id AND public.current_customer_mobile() IS NOT NULL
      AND right(regexp_replace(COALESCE(c.mobile,''),'\D','','g'),11) = public.current_customer_mobile()));

DROP POLICY IF EXISTS "customer read ttc" ON public.ttc_centers;
CREATE POLICY "customer read ttc" ON public.ttc_centers FOR SELECT TO authenticated USING (active AND public.is_active_account(auth.uid()));

DROP POLICY IF EXISTS "customer read occupations" ON public.occupations;
CREATE POLICY "customer read occupations" ON public.occupations FOR SELECT TO authenticated USING (active AND public.is_active_account(auth.uid()));