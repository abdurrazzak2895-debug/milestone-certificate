ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('bank','bkash','nagad','rocket')),
  sender text NOT NULL,
  trx_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff all payments" ON public.payments FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "customer read own payments" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = payments.candidate_id AND public.current_customer_mobile() IS NOT NULL AND right(regexp_replace(coalesce(c.mobile,''),'\D','','g'),11) = public.current_customer_mobile()));
CREATE POLICY "customer add own payment" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = payments.candidate_id AND public.current_customer_mobile() IS NOT NULL AND right(regexp_replace(coalesce(c.mobile,''),'\D','','g'),11) = public.current_customer_mobile()));

CREATE POLICY "authenticated read payment instructions" ON public.settings FOR SELECT TO authenticated
  USING (key = 'payment_instructions');

CREATE OR REPLACE FUNCTION public.portal_agent_contact()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; paid numeric; a record;
BEGIN
  IF public.current_customer_mobile() IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO c FROM candidates WHERE right(regexp_replace(coalesce(mobile,''),'\D','','g'),11) = public.current_customer_mobile() ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(amount),0) INTO paid FROM payments WHERE candidate_id = c.id AND status = 'approved';
  IF c.fee_amount > 0 AND paid < c.fee_amount THEN RETURN NULL; END IF;
  SELECT aa.full_name, aa.mobile, aa.agent_code INTO a FROM job_submissions s JOIN agent_accounts aa ON aa.user_id = s.submitted_by
   WHERE s.candidate_id = c.id ORDER BY s.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('name', a.full_name, 'mobile', a.mobile, 'code', a.agent_code);
END $$;
REVOKE ALL ON FUNCTION public.portal_agent_contact() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_agent_contact() TO authenticated;