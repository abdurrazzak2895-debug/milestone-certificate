import { supabase } from "@/integrations/supabase/client";

/**
 * Auto-cancel pending (draft) SVP bookings whose payment was not completed in time.
 * Safe to call on app load and from the SVP history pages.
 */
export async function cancelStaleSvpBookings(minutes = 30): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("cancel_stale_svp_bookings", {
      _minutes: minutes,
    });
    if (error) return 0;
    return Number(data ?? 0);
  } catch {
    return 0;
  }
}
