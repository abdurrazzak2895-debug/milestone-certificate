import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("শুধু অ্যাডমিন মেসেজ পাঠাতে পারবেন");
}

const filterSchema = z.object({
  mode: z.enum(["all", "include", "exclude"]),
  ids: z.array(z.string().uuid()).max(5000),
  limit: z.number().int().min(0).max(5000).nullable().optional(),
  agent_id: z.string().uuid().nullable().optional(),
  ttc_id: z.string().uuid().nullable().optional(),
  receive: z.enum(["any", "received", "not_received"]),
  day: z.enum(["any", "today", "tomorrow", "day_after", "date"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Simple stable hash so an identical manual message is never re-sent to the same candidate. */
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export const sendMessagesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ filter: filterSchema, body: z.string().trim().min(5).max(1500) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { enqueue, processPending } = await import("./messaging.server");
    const q = await enqueue(data.filter, data.body, `manual:${hash(data.body)}`, { userId: context.userId });
    const p = await processPending(150);
    return { ...q, ...p };
  });

export const processQueueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { processPending } = await import("./messaging.server");
    return processPending(150);
  });

export const retryFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("sms_messages").update({ status: "pending" }).in("status", ["failed", "sending"]);
    const { processPending } = await import("./messaging.server");
    return processPending(150);
  });

export const cancelPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("sms_messages").update({ status: "cancelled" }).eq("status", "pending").select("id");
    return { cancelled: data?.length ?? 0 };
  });

export const runAutomationsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { runAutomations, processPending } = await import("./messaging.server");
    const r = await runAutomations();
    return { ...r, ...(await processPending(150)) };
  });
