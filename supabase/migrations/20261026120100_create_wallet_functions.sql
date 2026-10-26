-- Wallet RPCs: ensure account, balance, booking fee charge, deposit review, admin adjust.
BEGIN;

CREATE OR REPLACE FUNCTION public.wallet_ensure_account(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallet_accounts (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.wallet_ensure_account(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wallet_my_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
BEGIN
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;
  PERFORM public.wallet_ensure_account(v_user);
  SELECT balance INTO v_balance FROM public.wallet_accounts WHERE user_id = v_user;
  RETURN COALESCE(v_balance, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.wallet_my_balance() TO authenticated;

CREATE OR REPLACE FUNCTION public.wallet_charge_booking(
  _reservation_id text,
  _amount numeric DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_fee numeric := ROUND(COALESCE(_amount, 100), 2);
  v_existing public.wallet_transactions%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'signed_out', 'balance', 0);
  END IF;
  IF _reservation_id IS NULL OR length(trim(_reservation_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_reference', 'balance', 0);
  END IF;
  IF v_fee <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount', 'balance', 0);
  END IF;

  PERFORM public.wallet_ensure_account(v_user);

  SELECT * INTO v_existing
  FROM public.wallet_transactions
  WHERE type = 'booking_fee' AND reference = _reservation_id
  LIMIT 1;
  IF FOUND THEN
    SELECT balance INTO v_balance FROM public.wallet_accounts WHERE user_id = v_user;
    RETURN jsonb_build_object('ok', true, 'balance', COALESCE(v_balance, 0), 'duplicate', true);
  END IF;

  SELECT balance INTO v_balance
  FROM public.wallet_accounts
  WHERE user_id = v_user
  FOR UPDATE;

  IF COALESCE(v_balance, 0) < v_fee THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', COALESCE(v_balance, 0));
  END IF;

  v_balance := v_balance - v_fee;
  UPDATE public.wallet_accounts SET balance = v_balance WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note, created_by)
  VALUES (v_user, 'booking_fee', -v_fee, v_balance, _reservation_id, 'SVP booking fee', v_user);
  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION public.wallet_charge_booking(text, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.wallet_review_deposit(
  _deposit_id uuid,
  _approve boolean,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reviewer uuid := auth.uid();
  v_deposit public.wallet_deposits%ROWTYPE;
  v_balance numeric;
BEGIN
  IF v_reviewer IS NULL OR NOT public.is_staff(v_reviewer) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;

  SELECT * INTO v_deposit FROM public.wallet_deposits WHERE id = _deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_deposit.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_reviewed', 'status', v_deposit.status);
  END IF;

  IF _approve THEN
    PERFORM public.wallet_ensure_account(v_deposit.user_id);
    SELECT balance INTO v_balance FROM public.wallet_accounts WHERE user_id = v_deposit.user_id FOR UPDATE;
    v_balance := COALESCE(v_balance, 0) + v_deposit.amount;
    UPDATE public.wallet_accounts SET balance = v_balance WHERE user_id = v_deposit.user_id;
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note, created_by)
    VALUES (v_deposit.user_id, 'deposit', v_deposit.amount, v_balance, _deposit_id::text, COALESCE(_note, v_deposit.note), v_reviewer);
  END IF;

  UPDATE public.wallet_deposits
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = v_reviewer,
      reviewed_at = now(),
      review_note = _note
  WHERE id = _deposit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    'balance', COALESCE(v_balance, 0)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.wallet_review_deposit(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.wallet_admin_adjust(
  _user_id uuid,
  _amount numeric,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_balance numeric;
  v_amount numeric := ROUND(COALESCE(_amount, 0), 2);
BEGIN
  IF v_admin IS NULL OR NOT public.is_staff(v_admin) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_allowed');
  END IF;
  IF v_amount = 0 OR _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  PERFORM public.wallet_ensure_account(_user_id);
  SELECT balance INTO v_balance FROM public.wallet_accounts WHERE user_id = _user_id FOR UPDATE;
  v_balance := COALESCE(v_balance, 0) + v_amount;
  IF v_balance < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', COALESCE(v_balance - v_amount, 0));
  END IF;

  UPDATE public.wallet_accounts SET balance = v_balance WHERE user_id = _user_id;
  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, note, created_by)
  VALUES (_user_id, 'adjustment', v_amount, v_balance, _note, v_admin);
  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION public.wallet_admin_adjust(uuid, numeric, text) TO authenticated;

COMMENT ON TABLE public.wallet_accounts IS 'Per-user wallet balance; agents/staff/sub-agents top up, admins approve.';
COMMENT ON TABLE public.wallet_transactions IS 'Immutable wallet ledger (deposit +, booking fee -, adjustment).';
COMMENT ON TABLE public.wallet_deposits IS 'Deposit requests awaiting admin/staff approval.';

NOTIFY pgrst, 'reload schema';
COMMIT;

