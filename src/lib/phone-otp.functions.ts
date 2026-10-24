import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const phoneInput = z.object({ mobile: z.string().regex(/^01[3-9]\d{8}$/) });
const verifyInput = phoneInput.extend({ code: z.string().regex(/^\d{6}$/) });

type SendResult = { ok: true } | { ok: false; reason: "cooldown" | "sms_failed" };
type VerifyResult =
  | { ok: true; tokenHash: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many" | "server" };

async function hashCode(phone: string, code: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${phone}:${code}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const sendPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => phoneInput.parse(d))
  .handler(async ({ data }): Promise<SendResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = `88${data.mobile}`;
    const { data: existing } = await supabaseAdmin
      .from("phone_otps")
      .select("last_sent_at")
      .eq("phone", phone)
      .maybeSingle();
    if (existing && Date.now() - new Date(existing.last_sent_at).getTime() < 60_000)
      return { ok: false, reason: "cooldown" };

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(
      6,
      "0",
    );
    const params = new URLSearchParams({
      api_key: process.env["BULKSMSBD_API_KEY"] ?? "",
      type: "text",
      number: phone,
      senderid: process.env["BULKSMSBD_SENDER_ID"] ?? "",
      message: `আপনার লগইন OTP: ${code}। ৫ মিনিটের মধ্যে ব্যবহার করুন। কাউকে জানাবেন না।`,
    });
    try {
      const res = await fetch(`http://bulksmsbd.net/api/smsapi?${params}`);
      const text = await res.text();
      let codeVal: unknown;
      try {
        codeVal = (JSON.parse(text) as { response_code?: unknown }).response_code;
      } catch {
        codeVal = undefined;
      }
      if (String(codeVal) !== "202") {
        console.error("BulkSMSBD send failed", res.status, text);
        return { ok: false, reason: "sms_failed" };
      }
    } catch (e) {
      console.error("BulkSMSBD request error", e);
      return { ok: false, reason: "sms_failed" };
    }

    await supabaseAdmin.from("phone_otps").upsert({
      phone,
      code_hash: await hashCode(phone, code),
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      attempts: 0,
      last_sent_at: new Date().toISOString(),
    });
    return { ok: true };
  });

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => verifyInput.parse(d))
  .handler(async ({ data }): Promise<VerifyResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = `88${data.mobile}`;
    const { data: row } = await supabaseAdmin
      .from("phone_otps")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();
    if (!row) return { ok: false, reason: "expired" };
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
    if (row.attempts >= 5) return { ok: false, reason: "too_many" };
    if ((await hashCode(phone, data.code)) !== row.code_hash) {
      await supabaseAdmin
        .from("phone_otps")
        .update({ attempts: row.attempts + 1 })
        .eq("phone", phone);
      return { ok: false, reason: "invalid" };
    }
    await supabaseAdmin.from("phone_otps").delete().eq("phone", phone);

    const email = `${phone}@phone.login.local`;
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      phone,
      email_confirm: true,
      phone_confirm: true,
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      console.error("createUser failed", createErr);
      return { ok: false, reason: "server" };
    }
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link.properties?.hashed_token) {
      console.error("generateLink failed", linkErr);
      return { ok: false, reason: "server" };
    }
    return { ok: true, tokenHash: link.properties.hashed_token };
  });
