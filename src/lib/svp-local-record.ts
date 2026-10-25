import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeSvpBookingForm, toSvpBookingInsert } from "@/lib/svp-booking.shared";

export type SvpLocalRecordPayload = ReturnType<typeof toSvpBookingInsert>;

/** Local persistence only. This helper never calls any SVP reservation or payment API. */
export async function saveSvpLocalBookingRecord(
  client: SupabaseClient<Database>,
  payload: SvpLocalRecordPayload,
): Promise<string> {
  const validated = toSvpBookingInsert(
    normalizeSvpBookingForm({
      ...payload,
      occupation: payload.occupation ?? "",
      center: payload.center ?? "",
      exam_date: payload.exam_date ?? "",
      exam_time: payload.exam_time ?? "",
      agency: payload.agency ?? "",
      login_email: payload.login_email ?? "",
      reference_no: payload.reference_no ?? "",
      notes: payload.notes ?? "",
    }),
  );
  if (!validated.reference_no)
    throw new Error("A successful SVP reservation reference is required.");

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Sign in to the app to save the local record.");

  // Recover a previously committed insert after a lost response, without rebooking.
  // The owner filter avoids mistaking another staff member's record for this user's save.
  const { data: existing, error: lookupError } = await client
    .from("svp_bookings")
    .select("id")
    .eq("reference_no", validated.reference_no)
    .eq("created_by", auth.user.id)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error("The local reservation record could not be checked.");
  if (existing?.id) return existing.id;

  const { data: saved, error } = await client
    .from("svp_bookings")
    .insert({ ...validated, created_by: auth.user.id })
    .select("id")
    .single();
  if (error || !saved?.id) throw new Error("The local reservation record could not be saved.");
  return saved.id;
}
