import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  buildSvpLoginBody,
  buildSvpOtpBody,
  summarizeSvpResponse,
  svpSessionDraftInputSchema,
  type SvpResponseSummary,
} from "@/lib/svp-session.shared";

const SVP_API_ORIGIN = "https://svp-international-api.pacc.sa";
const SVP_LOGIN_PATH = "/api/v1/sessions/login";
const SVP_OTP_PATH = "/api/v1/sessions/otp";
const SVP_PORTAL_ORIGIN = "https://svp-international.qiwa.sa";
const SVP_REQUEST_TIMEOUT_MS = 15_000;

const SVP_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Origin: SVP_PORTAL_ORIGIN,
  Referer: `${SVP_PORTAL_ORIGIN}/`,
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

async function postToSvp(path: string, locale: string, body: unknown): Promise<SvpResponseSummary> {
  const url = new URL(path, SVP_API_ORIGIN);
  url.searchParams.set("locale", locale);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SVP_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: SVP_HEADERS,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await summarizeSvpResponse(response);
  } catch {
    throw new Error("SVP request unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export const submitSvpSessionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => svpSessionDraftInputSchema.parse(input))
  .handler(async ({ context, data }): Promise<SvpResponseSummary> => {
    await requireAllowedRole(context.supabase, context.userId);

    if (data.step === "login") {
      return postToSvp(SVP_LOGIN_PATH, data.locale, buildSvpLoginBody(data));
    }
    return postToSvp(SVP_OTP_PATH, data.locale, buildSvpOtpBody(data));
  });
