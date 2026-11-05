import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
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
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/** Bulk SMS body: bounded length and no external links, so the account can't be used to spread phishing URLs. */
const safeBody = z
  .string()
  .trim()
  .min(5)
  .max(800)
  .refine(
    (b) =>
      !/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|xyz|top|info|link|ly|me)\b)/i.test(b) ||
      /maps\.app\.goo\.gl|google\.com\/maps/i.test(b),
    "মেসেজে বাইরের লিংক দেওয়া যাবে না (শুধু Google Maps লিংক চলবে)",
  );

/** Simple stable hash so an identical manual message is never re-sent to the same candidate. */
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export const sendMessagesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ filter: filterSchema, templateId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tpl } = await supabaseAdmin
      .from("sms_templates")
      .select("body")
      .eq("id", data.templateId)
      .maybeSingle();
    const body = (tpl as { body?: string } | null)?.body;
    if (!body || body.trim().length < 5) throw new Error("টেমপ্লেট পাওয়া যায়নি");
    const parsed = safeBody.safeParse(body);
    if (!parsed.success)
      throw new Error("টেমপ্লেটের মেসেজটি নিরাপদ নয় — লিংক বা অতিরিক্ত দৈর্ঘ্য ঠিক করুন");
    const { enqueue, processPending } = await import("./messaging.server");
    const q = await enqueue(
      data.filter,
      parsed.data,
      `manual:${data.templateId}:${hash(parsed.data)}`,
      { userId: context.userId },
    );
    const p = await processPending(150);
    return { ...q, ...p };
  });

/** Sends one test SMS to the admin's own registered account number before any bulk send. Logged with a unique key so it never dedupes. */
export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ body: z.string().trim().min(5).max(1500) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: acct } = await context.supabase
      .from("agent_accounts")
      .select("mobile")
      .eq("user_id", context.userId)
      .maybeSingle();
    const phone = (acct as { mobile?: string } | null)?.mobile?.replace(/\D/g, "") ?? "";
    if (!/^01[3-9]\d{8}$/.test(phone))
      throw new Error("আপনার অ্যাকাউন্টে সঠিক মোবাইল নম্বর সেট নেই");
    const { sendSms } = await import("./messaging.server");
    const err = await sendSms(phone, data.body);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("sms_messages").insert({
      dedupe_key: `test:${context.userId}:${Date.now()}`,
      recipient_name: "টেস্ট (নিজের নম্বর)",
      phone,
      body: data.body,
      status: err ? "failed" : "sent",
      error: err,
      created_by: context.userId,
      sent_at: err ? null : new Date().toISOString(),
    });
    if (err) throw new Error(err);
    return { ok: true };
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
    await supabaseAdmin
      .from("sms_messages")
      .update({ status: "pending" })
      .in("status", ["failed", "sending"]);
    const { processPending } = await import("./messaging.server");
    return processPending(150);
  });

export const cancelPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("sms_messages")
      .update({ status: "cancelled" })
      .eq("status", "pending")
      .select("id");
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
