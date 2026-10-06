import { supabase } from "@/integrations/supabase/client";

const KEY = "device_session_key";
const AT = "device_login_at";
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

/** Call right after a successful sign-in: this device becomes the only active one. */
export async function claimDeviceSession() {
  const key = crypto.randomUUID() + crypto.randomUUID();
  localStorage.setItem(KEY, key);
  localStorage.setItem(AT, String(Date.now()));
  await (supabase.rpc as any)("claim_device_session", { _key: key });
}

/** Returns a Bengali reason when this device must be signed out, else null. */
export async function checkDeviceSession(): Promise<string | null> {
  const key = localStorage.getItem(KEY);
  const at = Number(localStorage.getItem(AT) ?? 0);
  if (!key || !at || Date.now() - at > SESSION_MAX_MS) return "সেশনের মেয়াদ শেষ। আবার লগইন করুন।";
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
