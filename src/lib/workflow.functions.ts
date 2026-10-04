import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function hasAnyRole(supabase: any, userId: string, roles: string[]) {
  for (const role of roles) {
    const { data } = await supabase.rpc("has_role_text", { _user_id: userId, _role: role });
    if (data) return true;
  }
  return false;
}

export const reviewSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(500).optional(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await hasAnyRole(context.supabase, context.userId, ["admin", "staff"]))) throw new Error("অনুমতি নেই");
    const { error } = await context.supabase.from("job_submissions").update({
      status: data.status,
      rejection_reason: data.status === "rejected" ? data.reason || null : null,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const receiveCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    arrivalStatus: z.enum(["not_arrived", "received", "absent"]),
    secondaryMobile: z.string().regex(/^01[3-9]\d{8}$/).nullable(),
    skillDetails: z.string().trim().max(1000).nullable(),
    photoPath: z.string().max(500).nullable(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    if (!(await hasAnyRole(context.supabase, context.userId, ["admin", "staff", "management"]))) throw new Error("অনুমতি নেই");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const received = data.arrivalStatus === "received";
    const { error } = await supabaseAdmin.from("job_submissions").update({
      arrival_status: data.arrivalStatus,
      received_at: received ? new Date().toISOString() : null,
      received_by: received ? context.userId : null,
      secondary_mobile: data.secondaryMobile,
      skill_details: data.skillDetails,
      candidate_photo_path: data.photoPath,
    }).eq("id", data.id).eq("status", "approved");
    if (error) throw error;
    return { ok: true as const };
  });