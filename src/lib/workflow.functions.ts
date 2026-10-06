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
    }).eq("id", data.id).neq("status", "rejected");
    if (error) throw error;
    return { ok: true as const };
  });
/** Agent edits own submission — only while pending approval. */
export const updateMySubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    candidate_name: z.string().trim().min(2).max(120),
    passport_no: z.string().trim().min(5).max(20),
    mobile: z.string().regex(/^01[3-9]\d{8}$/),
    secondary_mobile: z.string().regex(/^01[3-9]\d{8}$/).nullable(),
    skill_details: z.string().trim().max(1000).nullable(),
    exam_at: z.string().datetime(),
    photoPath: z.string().max(500).nullable(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase.from("job_submissions").select("submitted_by,status").eq("id", data.id).maybeSingle();
    if (!row || row.submitted_by !== context.userId) throw new Error("অনুমতি নেই");
    if (row.status !== "pending_approval") throw new Error("অনুমোদিত/বাতিল কাজ আর এডিট করা যাবে না");
    if (data.photoPath && !data.photoPath.startsWith(`candidate-drafts/${context.userId}/`)) throw new Error("ছবি সঠিক নয়");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { candidate_name: string; passport_no: string; mobile: string; secondary_mobile: string | null; skill_details: string | null; exam_at: string; candidate_photo_path?: string } = {
      candidate_name: data.candidate_name.toUpperCase(), passport_no: data.passport_no.toUpperCase(), mobile: data.mobile,
      secondary_mobile: data.secondary_mobile, skill_details: data.skill_details, exam_at: data.exam_at,
    };
    if (data.photoPath) patch.candidate_photo_path = data.photoPath;
    const { error } = await supabaseAdmin.from("job_submissions").update(patch).eq("id", data.id).eq("status", "pending_approval");
    if (error) throw error;
    return { ok: true as const };
  });
