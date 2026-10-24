import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSvpLoginBody,
  buildSvpOtpBody,
  extractSvpSessionUser,
  svpSessionInputSchema,
  type SvpSessionResult,
  type SvpSystemConfig,
} from "@/lib/svp-session.shared";
import {
  buildStoredSession,
  clearPendingSvpSession,
  clearStoredSvpSession,
  mergeCookiePairs,
  readPendingSvpSession,
  readStoredSvpSession,
  requireSvpAllowedRole,
  responseCookies,
  SvpSessionMissingError,
  svpAuthedRequest,
  svpLoginRequest,
  writePendingSvpSession,
  writeStoredSvpSession,
} from "@/lib/svp-session.server";

// Fixed values from the real SVP portal login request. Server-managed, never form fields.
const SVP_SYSTEM_CONFIG: SvpSystemConfig = {
  feApp: "legislator",
  otpMethod: "email",
};

export type SvpSessionStatus = {
  signedIn: boolean;
  userName: string | null;
  login: string | null;
  expiresAt: number;
};

function loginFailure(
  step: "login" | "otp",
  status: number,
  message: string | null,
): SvpSessionResult {
  return {
    step,
    httpStatus: status,
    ok: false,
    otpRequired: false,
    authenticated: false,
    message:
      message ??
      (step === "login"
        ? "SVP rejected this username or password."
        : "SVP rejected this OTP. Check the code and try again."),
    session: null,
  };
}

/**
 * Real SVP sign-in: POST /sessions/login, then POST /sessions/otp.
 * A successful OTP stores the bearer token in the server-only session cookie.
 */
export const submitSvpLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => svpSessionInputSchema.parse(input))
  .handler(async ({ context, data }): Promise<SvpSessionResult> => {
    await requireSvpAllowedRole(context.supabase, context.userId);

    if (data.step === "login") {
      const { response, message } = await svpLoginRequest(
        "/sessions/login",
        buildSvpLoginBody(data, SVP_SYSTEM_CONFIG),
      );
      if (!response.ok) return loginFailure("login", response.status, message);

      writePendingSvpSession(context.userId, {
        login: data.login,
        refreshCookies: mergeCookiePairs("", responseCookies(response)),
        savedAt: Date.now(),
      });

      return {
        step: "login",
        httpStatus: response.status,
        ok: true,
        otpRequired: true,
        authenticated: false,
        message:
          message ??
          "SVP accepted the username and password. Enter the OTP sent to the registered email.",
        session: null,
      };
    }

    const { response, payload, message } = await svpLoginRequest(
      "/sessions/otp",
      buildSvpOtpBody(data, SVP_SYSTEM_CONFIG),
    );
    if (!response.ok) return loginFailure("otp", response.status, message);

    const pending = readPendingSvpSession(context.userId);
    const refreshCookies = mergeCookiePairs(
      pending?.refreshCookies ?? "",
      responseCookies(response),
    );
    const user = extractSvpSessionUser(payload);
    const session = buildStoredSession(data.login, payload, refreshCookies, user.name, user.id);

    if (!session) {
      return {
        step: "otp",
        httpStatus: response.status,
        ok: false,
        otpRequired: false,
        authenticated: false,
        message:
          "SVP accepted the OTP but did not return an access token. Try again or use the official portal.",
        session: null,
      };
    }

    writeStoredSvpSession(context.userId, session);
    clearPendingSvpSession(context.userId);

    // Verify the stored bearer token before claiming a working session.
    let verificationStatus: number | null = null;
    try {
      const verification = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/permissions",
        { query: { locale: "en" } },
      );
      verificationStatus = verification.status;
    } catch (error) {
      if (error instanceof SvpSessionMissingError) verificationStatus = 401;
    }
    if (verificationStatus === 401 || verificationStatus === 403) {
      clearStoredSvpSession(context.userId);
      return {
        step: "otp",
        httpStatus: verificationStatus,
        ok: false,
        otpRequired: false,
        authenticated: false,
        message:
          verificationStatus === 403
            ? "SVP rejected this account's booking permissions. Check the SVP account."
            : "SVP accepted the OTP but the session token was rejected. Try signing in again.",
        session: null,
      };
    }

    return {
      step: "otp",
      httpStatus: response.status,
      ok: true,
      otpRequired: false,
      authenticated: true,
      message: message ?? "Signed in to SVP.",
      session: {
        userName: session.userName,
        login: session.login,
        expiresAt: session.expiresAt,
      },
    };
  });

/** Whether this app user currently holds an SVP web session. */
export const getSvpSessionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SvpSessionStatus> => {
    const session = readStoredSvpSession(context.userId);
    const now = Math.floor(Date.now() / 1000);
    const active =
      session && (session.expiresAt > now || Boolean(session.refreshCookies)) ? session : null;
    if (session && !active) clearStoredSvpSession(context.userId);
    return {
      signedIn: Boolean(active),
      userName: active?.userName ?? null,
      login: active?.login ?? null,
      expiresAt: active?.expiresAt ?? 0,
    };
  });

/** Forget the stored SVP session for this app user. */
export const signOutSvpSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    clearStoredSvpSession(context.userId);
    return { ok: true };
  });
