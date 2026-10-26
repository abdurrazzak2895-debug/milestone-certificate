-- Pending (draft) SVP bookings that never completed payment are auto-cancelled
-- after 30 minutes. Safe to run from the app or a cron worker.
BEGIN;

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
