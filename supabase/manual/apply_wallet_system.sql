-- One-shot manual apply: wallet/deposit system + agent_accounts + pending auto-cancel.
-- Paste this whole file into Supabase Dashboard → SQL Editor and Run once.
BEGIN;

-- ===== 20261026120400_create_agent_accounts.sql =====
-- Managed accounts table used by agents/staff/reception. Some environments were
-- provisioned without it, which broke staff/sub-agent creation.

CREATE TABLE IF NOT EXISTS public.agent_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  mobile text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  agent_code text,
  active boolean NOT NULL DEFAULT true,
  has_unpaid boolean NOT NULL DEFAULT false,
  parent_agent_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_accounts_agent_code_key
  ON public.agent_accounts (upper(agent_code))
  WHERE agent_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_accounts_parent_idx
  ON public.agent_accounts (parent_agent_id);

ALTER TABLE public.agent_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_accounts_select_own_staff_parent ON public.agent_accounts;
CREATE POLICY agent_accounts_select_own_staff_parent
  ON public.agent_accounts FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR parent_agent_id = (SELECT auth.uid())
    OR public.is_staff((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS agent_accounts_update_staff ON public.agent_accounts;
CREATE POLICY agent_accounts_update_staff
  ON public.agent_accounts FOR UPDATE TO authenticated
  USING (public.is_staff((SELECT auth.uid())))
  WITH CHECK (public.is_staff((SELECT auth.uid())));

GRANT SELECT ON public.agent_accounts TO authenticated;
GRANT ALL ON public.agent_accounts TO service_role;

COMMENT ON TABLE public.agent_accounts IS
  'Managed agent/staff/reception accounts; sub-agents point at their parent agent.';

NOTIFY pgrst, 'reload schema';

-- ===== 20261026120000_create_wallet_system.sql =====
-- Wallet (balance/deposit) system: agents, staff and sub-agents can request
-- deposits; admins approve them. Every SVP booking charges a fixed fee.

CREATE TABLE IF NOT EXISTS public.wallet_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  balance numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deposit', 'booking_fee', 'adjustment')),
  amount numeric(12, 2) NOT NULL,
  balance_after numeric(12, 2) NOT NULL,
  reference text,
  note text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_booking_reference
  ON public.wallet_transactions (reference)
  WHERE type = 'booking_fee' AND reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS wallet_transactions_user_created
  ON public.wallet_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wallet_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'bkash',
  reference text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_deposits_status_created
  ON public.wallet_deposits (status, created_at DESC);

ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_accounts_select_own_or_staff ON public.wallet_accounts;
CREATE POLICY wallet_accounts_select_own_or_staff
  ON public.wallet_accounts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS wallet_transactions_select_own_or_staff ON public.wallet_transactions;
CREATE POLICY wallet_transactions_select_own_or_staff
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS wallet_deposits_select_own_or_staff ON public.wallet_deposits;
CREATE POLICY wallet_deposits_select_own_or_staff
  ON public.wallet_deposits FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS wallet_deposits_insert_own ON public.wallet_deposits;
CREATE POLICY wallet_deposits_insert_own
  ON public.wallet_deposits FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending');

CREATE OR REPLACE FUNCTION public.wallet_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallet_accounts_touch_updated_at ON public.wallet_accounts;
CREATE TRIGGER wallet_accounts_touch_updated_at
  BEFORE UPDATE ON public.wallet_accounts
  FOR EACH ROW EXECUTE FUNCTION public.wallet_touch_updated_at();


-- ===== 20261026120100_create_wallet_functions.sql =====
-- Wallet RPCs: ensure account, balance, booking fee charge, deposit review, admin adjust.

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


-- ===== 20261026120300_wallet_request_deposit.sql =====
-- Deposit request RPC: validated, SECURITY DEFINER insert so the request is always
-- recorded for the signed-in user even if table-level INSERT policies change.

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

-- ===== 20261026120200_cancel_stale_svp_bookings.sql =====
-- Pending (draft) SVP bookings that never completed payment are auto-cancelled
-- after 30 minutes. Safe to run from the app or a cron worker.

CREATE OR REPLACE FUNCTION public.cancel_stale_svp_bookings(_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_minutes integer := GREATEST(COALESCE(_minutes, 30), 1);
BEGIN
  UPDATE public.svp_bookings
  SET status = 'cancelled',
      notes = LEFT(
        COALESCE(NULLIF(notes, ''), '')
        || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE ' · ' END
        || 'auto-cancelled: payment not completed within ' || v_minutes || ' minutes',
        1000
      ),
      updated_at = now()
  WHERE status = 'draft'
    AND created_at < now() - make_interval(mins => v_minutes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_stale_svp_bookings(integer) TO authenticated;

COMMENT ON FUNCTION public.cancel_stale_svp_bookings(integer) IS
  'Cancels draft SVP bookings whose payment was not completed in time (default 30 minutes).';

NOTIFY pgrst, 'reload schema';
COMMIT;
