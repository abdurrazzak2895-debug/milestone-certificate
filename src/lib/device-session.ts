import { supabase } from "@/integrations/supabase/client";

const KEY = "device_session_key";
const AT = "device_login_at";
const MAX = "device_session_max";
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
export const ADMIN_SESSION_MAX_MS = 24 * 60 * 60 * 1000;

/** Call right after a successful sign-in: this device becomes the active one (admins: 24h, others: 12h). */
export async function claimDeviceSession() {
  const key = crypto.randomUUID() + crypto.randomUUID();
  localStorage.setItem(KEY, key);
  localStorage.setItem(AT, String(Date.now()));
  await (supabase.rpc as any)("claim_device_session", { _key: key });
  const { data: u } = await supabase.auth.getUser();
  let admin = false;
  if (u.user) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin");
    admin = (data?.length ?? 0) > 0;
  }
  localStorage.setItem(MAX, String(admin ? ADMIN_SESSION_MAX_MS : SESSION_MAX_MS));
}

/** Returns a Bengali reason when this device must be signed out, else null. */
export async function checkDeviceSession(): Promise<string | null> {
  const key = localStorage.getItem(KEY);
  const at = Number(localStorage.getItem(AT) ?? 0);
  const max = Math.min(Number(localStorage.getItem(MAX) ?? SESSION_MAX_MS) || SESSION_MAX_MS, ADMIN_SESSION_MAX_MS);
  if (!key || !at || Date.now() - at > max) return "সেশনের মেয়াদ শেষ। আবার লগইন করুন।";
  const { data, error } = await (supabase.rpc as any)("is_current_device_session", { _key: key });
  if (!error && data === false) return "অন্য একটি ডিভাইসে এই আইডিতে লগইন করা হয়েছে, তাই এখান থেকে লগআউট করা হয়েছে।";
  return null;
}

export async function forceSignOut(reason: string) {
  localStorage.removeItem(KEY);
  localStorage.removeItem(AT);
  sessionStorage.setItem("logout_reason", reason);
  await supabase.auth.signOut();
}
