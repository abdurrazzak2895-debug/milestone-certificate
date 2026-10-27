# Manual database setup

Run these once in the Supabase Dashboard → SQL Editor (in this order) when a fresh
project stops with errors like `Could not find the table 'public.wallet_deposits'
in the schema cache`:

1. `apply_core_functions.sql` — helper RPCs (`is_staff`, `is_active_account`,
   `gen_ref_code`, device sessions, result lookup, …) + `exam_result` enum.
2. `apply_core_tables.sql` — the missing application tables reconstructed from
   `src/integrations/supabase/types.ts` (candidates, exams, job_submissions,
   occupations, payments, SMS tables, wallet-excluded core tables, …).
3. `apply_core_policies.sql` — reception (management) and parent-agent policies.
4. `apply_wallet_system.sql` — `agent_accounts`, wallet tables, wallet RPCs and
   the pending-booking auto-cancel function.

After the last file runs, PostgREST's schema cache reloads (`NOTIFY pgrst,
'reload schema'`), so the app can use the tables immediately.
