import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const emailFor = (mobile: string) => `88${mobile}@phone.login.local`;

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("শুধু অ্যাডমিন এই কাজ করতে পারবেন");
}

export type Account = { id: string; name: string; mobile: string; role: string; agent_code: string | null; active: boolean; created_at: string };

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Account[]> => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("অনুমতি নেই");
    const { data } = await context.supabase.from("agent_accounts").select("*").order("created_at", { ascending: false });
    return (data ?? []).map((a) => ({ id: a.user_id, name: a.full_name, mobile: a.mobile, role: a.role, agent_code: a.agent_code, active: a.active, created_at: a.created_at }));
  });

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  mobile: z.string().regex(/^01[3-9]\d{8}$/),
  password: z.string().min(6).max(72),
  role: z.enum(["agent", "service_provider"]),
  agent_code: z.string().trim().max(30).regex(/^[A-Za-z0-9-]*$/).optional(),
});

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.agent_code?.toUpperCase() || null;
    if (code) {
      const { data: dup } = await supabaseAdmin.from("agent_accounts").select("user_id").eq("agent_code", code).maybeSingle();
      if (dup) return { ok: false as const, message: "এই ID আগেই ব্যবহার হয়েছে" };
    }
    const email = emailFor(data.mobile);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email, password: data.password, email_confirm: true, user_metadata: { full_name: data.name },
    });
    if (error || !created.user) {
      return { ok: false as const, message: /already/i.test(error?.message ?? "") ? "এই মোবাইল নম্বরে আগেই অ্যাকাউন্ট আছে" : "অ্যাকাউন্ট তৈরি করা যায়নি" };
    }
    const uid = created.user.id;
    await supabaseAdmin.from("profiles").upsert({ id: uid, full_name: data.name, email });
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    const { error: aErr } = await supabaseAdmin.from("agent_accounts").insert({ user_id: uid, full_name: data.name, mobile: data.mobile, role: data.role, agent_code: code });
    if (rErr || aErr) return { ok: false as const, message: "রোল সেট করা যায়নি" };
    return { ok: true as const };
  });

async function assertManagedAccount(supabaseAdmin: any, id: string) {
  const { data } = await supabaseAdmin.from("agent_accounts").select("user_id").eq("user_id", id).maybeSingle();
  return !!data;
}

export const resetAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), password: z.string().min(6).max(72) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertManagedAccount(supabaseAdmin, data.id))) return { ok: false };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password: data.password });
    return { ok: !error };
  });

export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("agent_accounts").update({ active: data.active }).eq("user_id", data.id);
    return { ok: !error };
  });

export const changeMyAdminEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { email: data.email, email_confirm: true });
    if (error) return { ok: false as const, message: /already|exists/i.test(error.message) ? "এই ইমেইল আগেই ব্যবহৃত" : "ইমেইল পরিবর্তন করা যায়নি" };
    await supabaseAdmin.from("profiles").update({ email: data.email }).eq("id", context.userId);
    return { ok: true as const };
  });
