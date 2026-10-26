-- Managed accounts table used by agents/staff/reception. Some environments were
-- provisioned without it, which broke staff/sub-agent creation.
BEGIN;

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
COMMIT;
