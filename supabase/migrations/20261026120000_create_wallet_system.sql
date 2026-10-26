-- Wallet (balance/deposit) system: agents, staff and sub-agents can request
-- deposits; admins approve them. Every SVP booking charges a fixed fee.
BEGIN;

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

COMMIT;
