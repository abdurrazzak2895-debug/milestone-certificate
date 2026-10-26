import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const emailFor = (mobile: string) => `88${mobile}@phone.login.local`;

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("শুধু অ্যাডমিন এই কাজ করতে পারবেন");
}

export type Account = {
  id: string;
  name: string;
  mobile: string;
  role: string;
  agent_code: string | null;
  active: boolean;
  has_unpaid: boolean;
  created_at: string;
  parent_name: string | null;
};

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Account[]> => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("অনুমতি নেই");
    const { data } = await context.supabase
      .from("agent_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: rr } = await context.supabase.from("user_roles").select("user_id, role");
    const dual = new Set(
      (rr ?? [])
        .filter(
          (r) =>
            r.role === "agent" &&
            (rr ?? []).some((x) => x.user_id === r.user_id && x.role === "management"),
        )
        .map((r) => r.user_id),
    );
    return (data ?? []).map((a) => ({
      id: a.user_id,
      name: a.full_name,
      mobile: a.mobile,
      role: dual.has(a.user_id) ? "reception_agent" : a.role,
      agent_code: a.agent_code,
      active: a.active,
      has_unpaid: !!a.has_unpaid,
      created_at: a.created_at,
      parent_name: a.parent_agent_id
        ? ((data ?? []).find((p) => p.user_id === a.parent_agent_id)?.full_name ?? "এজেন্ট")
        : null,
    }));
  });

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  mobile: z.string().regex(/^01[3-9]\d{8}$/),
  password: z.string().min(6).max(72),
  role: z.enum(["agent", "service_provider", "management", "reception_agent"]),
  agent_code: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9-]*$/)
    .optional(),
});

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.agent_code?.toUpperCase() || null;
    if (code) {
      const { data: dup } = await supabaseAdmin
        .from("agent_accounts")
        .select("user_id")
        .eq("agent_code", code)
        .maybeSingle();
      if (dup) return { ok: false as const, message: "এই ID আগেই ব্যবহার হয়েছে" };
    }
    const email = emailFor(data.mobile);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name },
    });
    if (error || !created.user) {
      const reason = error?.message ?? "auth user was not returned";
      return {
        ok: false as const,
        message: /already|registered|exists/i.test(reason)
          ? "এই মোবাইল নম্বরে আগেই অ্যাকাউন্ট আছে"
          : `অ্যাকাউন্ট তৈরি করা যায়নি: ${reason}`,
      };
    }
    const uid = created.user.id;
    const roleRows =
      data.role === "reception_agent"
        ? [
            { user_id: uid, role: "management" as const },
            { user_id: uid, role: "agent" as const },
          ]
        : [{ user_id: uid, role: data.role }];
    const profileRes = await supabaseAdmin
      .from("profiles")
      .upsert({ id: uid, full_name: data.name, email }, { onConflict: "id" });
    const roleRes = await supabaseAdmin
      .from("user_roles")
      .upsert(roleRows, { onConflict: "user_id,role", ignoreDuplicates: true });
    const accountRes = await supabaseAdmin.from("agent_accounts").upsert(
      {
        user_id: uid,
        full_name: data.name,
        mobile: data.mobile,
        role: data.role === "reception_agent" ? "management" : data.role,
        agent_code: code,
        active: true,
      },
      { onConflict: "user_id" },
    );
    const failure = profileRes.error ?? roleRes.error ?? accountRes.error;
    if (failure) {
      // Never leave a half-created login behind.
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => undefined);
      return { ok: false as const, message: `অ্যাকাউন্ট সেটআপ ব্যর্থ: ${failure.message}` };
    }
    return { ok: true as const };
  });

async function assertManagedAccount(supabaseAdmin: SupabaseClient<Database>, id: string) {
  const { data } = await supabaseAdmin
    .from("agent_accounts")
    .select("user_id")
    .eq("user_id", id)
    .maybeSingle();
  return !!data;
}

export const resetAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), password: z.string().min(6).max(72) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertManagedAccount(supabaseAdmin, data.id))) return { ok: false };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.password,
    });
    return { ok: !error };
  });

export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("agent_accounts")
      .update({ active: data.active })
      .eq("user_id", data.id);
    return { ok: !error };
  });

/** Admin manually flags an account as having unpaid dues; agents see a red warning on every work event. */
export const setAccountUnpaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), unpaid: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("agent_accounts")
      .update({ has_unpaid: data.unpaid })
      .eq("user_id", data.id);
    return { ok: !error };
  });

/** Any logged-in account reads only its own unpaid flag. */
export const getMyUnpaidFlag = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("agent_accounts")
      .select("has_unpaid")
      .eq("user_id", context.userId)
      .maybeSingle();
    return !!data?.has_unpaid;
  });

export const changeMyAdminEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      email: data.email,
      email_confirm: true,
    });
    if (error)
      return {
        ok: false as const,
        message: /already|exists/i.test(error.message)
          ? "এই ইমেইল আগেই ব্যবহৃত"
          : "ইমেইল পরিবর্তন করা যায়নি",
      };
    await supabaseAdmin.from("profiles").update({ email: data.email }).eq("id", context.userId);
    return { ok: true as const };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.id === context.userId) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertManagedAccount(supabaseAdmin, data.id))) return { ok: false };
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
    await supabaseAdmin.from("agent_accounts").delete().eq("user_id", data.id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    return { ok: !error };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  mobile: z.string().regex(/^01[3-9]\d{8}$/),
  role: z.enum(["agent", "service_provider", "management", "reception_agent"]),
  agent_code: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9-]*$/)
    .optional(),
});

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertManagedAccount(supabaseAdmin, data.id)))
      return { ok: false as const, message: "অ্যাকাউন্ট পাওয়া যায়নি" };
    const code = data.agent_code?.toUpperCase() || null;
    if (code) {
      const { data: dup } = await supabaseAdmin
        .from("agent_accounts")
        .select("user_id")
        .eq("agent_code", code)
        .neq("user_id", data.id)
        .maybeSingle();
      if (dup) return { ok: false as const, message: "এই ID আগেই ব্যবহার হয়েছে" };
    }
    const { data: cur } = await supabaseAdmin
      .from("agent_accounts")
      .select("mobile")
      .eq("user_id", data.id)
      .maybeSingle();
    const email = emailFor(data.mobile);
    if (cur?.mobile !== data.mobile) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
        email,
        email_confirm: true,
        user_metadata: { full_name: data.name },
      });
      if (error)
        return {
          ok: false as const,
          message: /already|exists/i.test(error.message)
            ? "এই মোবাইল নম্বরে আগেই অ্যাকাউন্ট আছে"
            : "মোবাইল পরিবর্তন করা যায়নি",
        };
    } else {
      await supabaseAdmin.auth.admin.updateUserById(data.id, {
        user_metadata: { full_name: data.name },
      });
    }
    await supabaseAdmin.from("profiles").upsert({ id: data.id, full_name: data.name, email });
    const { error: aErr } = await supabaseAdmin
      .from("agent_accounts")
      .update({
        full_name: data.name,
        mobile: data.mobile,
        agent_code: code,
        role: data.role === "reception_agent" ? "management" : data.role,
      })
      .eq("user_id", data.id);
    if (aErr) return { ok: false as const, message: "তথ্য সংরক্ষণ করা যায়নি" };
    const roles = data.role === "reception_agent" ? ["management", "agent"] : [data.role];
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.id)
      .in("role", ["agent", "service_provider", "management"]);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert(roles.map((r) => ({ user_id: data.id, role: r as "agent" })));
    if (rErr) return { ok: false as const, message: "রোল সেট করা যায়নি" };
    return { ok: true as const };
  });

/** Main agents (not sub-agents) create sub-agent IDs that get every agent facility. */
export const createSubAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(100),
        mobile: z.string().regex(/^01[3-9]\d{8}$/),
        password: z.string().min(6).max(72),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: isAgent } = await context.supabase.rpc("has_role_text", {
      _user_id: context.userId,
      _role: "agent",
    });
    if (!isAgent) return { ok: false as const, message: "শুধু এজেন্ট সাব-এজেন্ট তৈরি করতে পারবেন" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("agent_accounts")
      .select("active,parent_agent_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!me || !me.active || me.parent_agent_id)
      return {
        ok: false as const,
        message: "সাব-এজেন্ট আইডি থেকে আরেকটি সাব-এজেন্ট তৈরি করা যাবে না",
      };
    const email = emailFor(data.mobile);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name },
    });
    if (error || !created.user) {
      const reason = error?.message ?? "auth user was not returned";
      return {
        ok: false as const,
        message: /already|registered|exists/i.test(reason)
          ? "এই মোবাইল নম্বরে আগেই অ্যাকাউন্ট আছে"
          : `অ্যাকাউন্ট তৈরি করা যায়নি: ${reason}`,
      };
    }
    const uid = created.user.id;
    const profileRes = await supabaseAdmin
      .from("profiles")
      .upsert({ id: uid, full_name: data.name, email }, { onConflict: "id" });
    const roleRes = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: uid, role: "agent" },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    const accountRes = await supabaseAdmin.from("agent_accounts").upsert(
      {
        user_id: uid,
        full_name: data.name,
        mobile: data.mobile,
        role: "agent",
        parent_agent_id: context.userId,
        active: true,
      },
      { onConflict: "user_id" },
    );
    const failure = profileRes.error ?? roleRes.error ?? accountRes.error;
    if (failure) {
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => undefined);
      return { ok: false as const, message: `সাব-এজেন্ট সেটআপ ব্যর্থ: ${failure.message}` };
    }
    return { ok: true as const };
  });

export const setSubAgentActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("agent_accounts")
      .update({ active: data.active })
      .eq("user_id", data.id)
      .eq("parent_agent_id", context.userId);
    return { ok: !error };
  });

/** Parent agent approves/rejects a sub-agent's work; approved work moves to the normal admin queue. */
export const reviewSubAgentWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("job_submissions")
      .select("submitted_by,status")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || row.status !== "pending_agent") return { ok: false as const };
    const { data: sub } = await supabaseAdmin
      .from("agent_accounts")
      .select("parent_agent_id")
      .eq("user_id", row.submitted_by)
      .maybeSingle();
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (sub?.parent_agent_id !== context.userId && !isAdmin) return { ok: false as const };
    const { error } = await supabaseAdmin
      .from("job_submissions")
      .update(
        data.approve
          ? { status: "pending_approval" }
          : {
              status: "rejected",
              rejection_reason: data.reason || "এজেন্ট বাতিল করেছেন",
              reviewed_by: context.userId,
              reviewed_at: new Date().toISOString(),
            },
      )
      .eq("id", data.id);
    return { ok: !error };
  });
