import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const emailFor = (mobile: string) => `88${mobile}@phone.login.local`;

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("শুধু অ্যাডমিন এই কাজ করতে পারবেন");
}

export type Account = { id: string; name: string; mobile: string; role: string; created_at: string };

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Account[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role").in("role", ["agent", "service_provider"]);
    if (!roles?.length) return [];
    const ids = roles.map((r) => r.user_id);
    const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name, email, created_at").in("id", ids);
    return roles.map((r) => {
      const p = profs?.find((x) => x.id === r.user_id);
      return {
        id: r.user_id,
        role: r.role,
        name: p?.full_name ?? "",
        mobile: (p?.email ?? "").replace(/^88/, "").replace(/@.*/, ""),
        created_at: p?.created_at ?? "",
      };
    });
  });

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  mobile: z.string().regex(/^01[3-9]\d{8}$/),
  password: z.string().min(6).max(72),
  role: z.enum(["agent", "service_provider"]),
});

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = emailFor(data.mobile);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name },
    });
    if (error || !created.user) {
      return { ok: false as const, message: /already/i.test(error?.message ?? "") ? "এই মোবাইল নম্বরে আগেই অ্যাকাউন্ট আছে" : "অ্যাকাউন্ট তৈরি করা যায়নি" };
    }
    const uid = created.user.id;
    await supabaseAdmin.from("profiles").upsert({ id: uid, full_name: data.name, email });
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (rErr) return { ok: false as const, message: "রোল সেট করা যায়নি" };
    return { ok: true as const };
  });

export const resetAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), password: z.string().min(6).max(72) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.id);
    if (!r?.some((x) => x.role === "agent" || x.role === "service_provider")) return { ok: false as const };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password: data.password });
    return { ok: !error };
  });
