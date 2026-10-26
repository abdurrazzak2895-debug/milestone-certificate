-- Deposit request RPC: validated, SECURITY DEFINER insert so the request is always
-- recorded for the signed-in user even if table-level INSERT policies change.
BEGIN;

CREATE OR REPLACE FUNCTION public.wallet_request_deposit(
  _amount numeric,
  _method text DEFAULT 'bkash',
  _reference text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_amount numeric := ROUND(COALESCE(_amount, 0), 2);
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'signed_out');
  END IF;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  INSERT INTO public.wallet_deposits (user_id, amount, method, reference, note, status)
  VALUES (
    v_user,
    v_amount,
    COALESCE(NULLIF(trim(_method), ''), 'bkash'),
    NULLIF(trim(_reference), ''),
    NULLIF(trim(_note), ''),
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.wallet_request_deposit(numeric, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.wallet_request_deposit(numeric, text, text, text) IS
  'Creates a pending deposit request for the signed-in user.';

NOTIFY pgrst, 'reload schema';
COMMIT;
