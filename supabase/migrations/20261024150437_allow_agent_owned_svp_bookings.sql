-- Allow agent accounts to use the manual SVP tracker, but only for records
-- they create. Admin/staff retain cross-record access. No client-side DELETE.
BEGIN;

DROP POLICY IF EXISTS svp_bookings_select_admin_staff ON public.svp_bookings;
DROP POLICY IF EXISTS svp_bookings_insert_admin_staff ON public.svp_bookings;
DROP POLICY IF EXISTS svp_bookings_update_admin_staff ON public.svp_bookings;

CREATE POLICY svp_bookings_select_admin_staff_agent_own
  ON public.svp_bookings
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'staff'::public.app_role)
    OR (
      public.has_role((SELECT auth.uid()), 'agent'::public.app_role)
      AND created_by = (SELECT auth.uid())
    )
  );

CREATE POLICY svp_bookings_insert_admin_staff_agent
  ON public.svp_bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'staff'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'agent'::public.app_role)
    )
  );

CREATE POLICY svp_bookings_update_admin_staff_agent_own
  ON public.svp_bookings
  FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'staff'::public.app_role)
    OR (
      public.has_role((SELECT auth.uid()), 'agent'::public.app_role)
      AND created_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'staff'::public.app_role)
    OR (
      public.has_role((SELECT auth.uid()), 'agent'::public.app_role)
      AND created_by = (SELECT auth.uid())
    )
  );

COMMENT ON POLICY svp_bookings_select_admin_staff_agent_own ON public.svp_bookings IS
  'Admins/staff see all manual records; agents see only rows they created.';
COMMENT ON POLICY svp_bookings_update_admin_staff_agent_own ON public.svp_bookings IS
  'Admins/staff update all manual records; agents update only rows they created.';

NOTIFY pgrst, 'reload schema';
COMMIT;
