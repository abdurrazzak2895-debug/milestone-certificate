-- Extra role policies: reception (management) can manage the core records, and a
-- parent agent can read/update its sub-agents' submissions. Apply after the tables.
BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['candidates','exams','results','job_submissions','work_notes','payments','receive_status_log'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_management_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_management_user(auth.uid())) WITH CHECK (public.is_management_user(auth.uid()))',
      t || '_management_all', t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS job_submissions_parent_select ON public.job_submissions;
CREATE POLICY job_submissions_parent_select
  ON public.job_submissions FOR SELECT TO authenticated
  USING (public.parent_agent_of(submitted_by) = auth.uid());

DROP POLICY IF EXISTS job_submissions_parent_update ON public.job_submissions;
CREATE POLICY job_submissions_parent_update
  ON public.job_submissions FOR UPDATE TO authenticated
  USING (public.parent_agent_of(submitted_by) = auth.uid())
  WITH CHECK (public.parent_agent_of(submitted_by) = auth.uid());

NOTIFY pgrst, 'reload schema';
COMMIT;
