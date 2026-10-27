-- CBT result PDF download fee (admin-configurable via settings.cbt_result_fee).
BEGIN;

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('deposit', 'booking_fee', 'adjustment', 'cbt_result'));

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_cbt_reference
  ON public.wallet_transactions (reference)
  WHERE type = 'cbt_result' AND reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.wallet_charge_cbt_result(_reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_fee numeric := 50;
  v_balance numeric;
  v_existing public.wallet_transactions%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'signed_out', 'fee', 0, 'balance', 0);
  END IF;
  IF _reference IS NULL OR length(trim(_reference)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_reference', 'fee', 0, 'balance', 0);
  END IF;

  SELECT COALESCE(NULLIF(trim(value), '')::numeric, 50)
    INTO v_fee
    FROM public.settings
    WHERE key = 'cbt_result_fee'
    LIMIT 1;
  v_fee := GREATEST(COALESCE(v_fee, 50), 0);

  PERFORM public.wallet_ensure_account(v_user);

  SELECT * INTO v_existing
  FROM public.wallet_transactions
  WHERE type = 'cbt_result' AND reference = _reference
  LIMIT 1;
  IF FOUND THEN
    SELECT balance INTO v_balance FROM public.wallet_accounts WHERE user_id = v_user;
    RETURN jsonb_build_object(
      'ok', true, 'fee', v_fee, 'balance', COALESCE(v_balance, 0), 'duplicate', true
    );
  END IF;

  SELECT balance INTO v_balance
  FROM public.wallet_accounts
  WHERE user_id = v_user
  FOR UPDATE;

  IF v_fee > 0 AND COALESCE(v_balance, 0) < v_fee THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'insufficient', 'fee', v_fee, 'balance', COALESCE(v_balance, 0)
    );
  END IF;

  IF v_fee > 0 THEN
    v_balance := v_balance - v_fee;
    UPDATE public.wallet_accounts SET balance = v_balance WHERE user_id = v_user;
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note, created_by)
    VALUES (v_user, 'cbt_result', -v_fee, v_balance, _reference, 'CBT result PDF fee', v_user);
  END IF;

  RETURN jsonb_build_object('ok', true, 'fee', v_fee, 'balance', COALESCE(v_balance, 0));
END;
$$;
GRANT EXECUTE ON FUNCTION public.wallet_charge_cbt_result(text) TO authenticated;

COMMENT ON FUNCTION public.wallet_charge_cbt_result(text) IS
  'Charges the admin-configured CBT result PDF fee once per reservation.';

INSERT INTO public.settings (key, value)
VALUES ('cbt_result_fee', '50')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
