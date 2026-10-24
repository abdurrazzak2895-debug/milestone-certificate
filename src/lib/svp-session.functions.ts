import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  buildSvpLoginBody,
  buildSvpOtpBody,
  readSvpSessionResult,
  svpSessionInputSchema,
  type SvpSessionResult,
  type SvpSystemConfig,
} from "@/lib/svp-session.shared";

const SVP_API_ORIGIN = "https://svp-international-api.pacc.sa";
const SVP_LOGIN_PATH = "/api/v1/sessions/login";
const SVP_OTP_PATH = "/api/v1/sessions/otp";
const SVP_PORTAL_ORIGIN = "https://svp-international.qiwa.sa";
const SVP_REQUEST_TIMEOUT_MS = 15_000;

// Fixed values from the supplied Postman login/OTP request. They are server-managed, not form fields.
const SVP_SYSTEM_CONFIG: SvpSystemConfig & { locale: string } = {
  feApp: "legislator",
  otpMethod: "email",
  locale: "en",
};

const SVP_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Origin: SVP_PORTAL_ORIGIN,
  Referer: `${SVP_PORTAL_ORIGIN}/`,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
} as const;

async function requireAllowedRole(supabase: SupabaseClient<Database>, userId: string) {
  const { data: rows, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (
    error ||
    !rows?.some((row: { role: string }) => ["admin", "staff", "agent"].includes(row.role))
  ) {
    throw new Error("Unauthorized");
  }
}

async function postToSvp(
  path: string,
  body: unknown,
  step: "login" | "otp",
  redact: string[],
): Promise<SvpSessionResult> {
  const url = new URL(path, SVP_API_ORIGIN);
  url.searchParams.set("locale", SVP_SYSTEM_CONFIG.locale);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SVP_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: SVP_HEADERS,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await readSvpSessionResult(response, step, redact);
  } catch {
    throw new Error("SVP could not be reached. Check the connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
}

export const submitSvpLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => svpSessionInputSchema.parse(input))
  .handler(async ({ context, data }): Promise<SvpSessionResult> => {
    await requireAllowedRole(context.supabase, context.userId);

    if (data.step === "login") {
      return postToSvp(SVP_LOGIN_PATH, buildSvpLoginBody(data, SVP_SYSTEM_CONFIG), "login", [
        data.login,
        data.password,
      ]);
    }
    return postToSvp(SVP_OTP_PATH, buildSvpOtpBody(data, SVP_SYSTEM_CONFIG), "otp", [
      data.login,
      data.password,
      data.otpAttempt,
    ]);
  });
