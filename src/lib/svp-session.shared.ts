import { z } from "zod";

export const svpLoginInputSchema = z.object({
  login: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(512),
});

export const svpOtpInputSchema = svpLoginInputSchema.extend({
  otpAttempt: z.string().trim().min(1).max(128),
});

export const svpSessionInputSchema = z.discriminatedUnion("step", [
  svpLoginInputSchema.extend({ step: z.literal("login") }),
  svpOtpInputSchema.extend({ step: z.literal("otp") }),
]);

export type SvpLoginInput = z.infer<typeof svpLoginInputSchema>;
export type SvpOtpInput = z.infer<typeof svpOtpInputSchema>;
export type SvpSessionDraftInput = z.infer<typeof svpSessionInputSchema>;

export type SvpSystemConfig = {
  feApp: string;
  otpMethod: string;
};

export type SvpLoginBody = {
  user: {
    fe_app: string;
    login: string;
    otp_method: string;
    password: string;
  };
};

export type SvpOtpBody = {
  user: {
    fe_app: string;
    login: string;
    otp_attempt: string;
    otp_method: string;
    password: string;
  };
};

export function buildSvpLoginBody(input: SvpLoginInput, system: SvpSystemConfig): SvpLoginBody {
  return {
    user: {
      fe_app: system.feApp,
      login: input.login,
      otp_method: system.otpMethod,
      password: input.password,
    },
  };
}

export function buildSvpOtpBody(input: SvpOtpInput, system: SvpSystemConfig): SvpOtpBody {
  return {
    user: {
      fe_app: system.feApp,
      login: input.login,
      otp_attempt: input.otpAttempt,
      otp_method: system.otpMethod,
      password: input.password,
    },
  };
}

export type SvpSessionStep = "login" | "otp";

/**
 * Outcome of one real SVP request. Only the provider's human-readable message is
 * surfaced; tokens and other response values never leave the server.
 */
export type SvpSessionResult = {
  step: SvpSessionStep;
  httpStatus: number;
  ok: boolean;
  otpRequired: boolean;
  authenticated: boolean;
  message: string;
};

const MAX_RESPONSE_BODY_BYTES = 64 * 1024;
const MAX_MESSAGE_LENGTH = 240;
const MAX_MESSAGE_DEPTH = 4;

const MESSAGE_KEYS = ["message", "error_description", "detail", "notice", "error"] as const;
const ERROR_KEYS = ["error", "errors", "error_description"] as const;
const SESSION_TOKEN_KEYS = new Set([
  "access_token",
  "auth_token",
  "id_token",
  "session_token",
  "bearer_token",
  "token",
  "jwt",
]);

async function readBoundedResponseBody(response: Response): Promise<string | null> {
  const stream = response.body;
  if (!stream) {
    const body = await response.text();
    return new TextEncoder().encode(body).byteLength <= MAX_RESPONSE_BODY_BYTES ? body : null;
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
}

/** Pull the first readable string out of a provider message/error value. */
function firstMessage(value: unknown, depth = 0): string | null {
  if (depth > MAX_MESSAGE_DEPTH) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstMessage(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const found = firstMessage(entry, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function providerMessage(payload: unknown, keys: readonly string[]): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const found = firstMessage(record[key]);
    if (found) return found;
  }
  return null;
}

/** Drop control characters without a control-character regex. */
function stripControlCharacters(value: string): string {
  let output = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    output += code < 32 || code === 127 ? " " : character;
  }
  return output;
}

/** Remove HTML, control characters, and any echoed credentials from provider text. */
function sanitizeMessage(raw: string | null, redact: string[]): string | null {
  if (!raw) return null;
  let text = stripControlCharacters(raw.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  for (const secret of redact) {
    const value = secret.trim();
    if (value.length < 3) continue;
    text = text.split(value).join("[redacted]");
    text = text.replace(
      new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      "[redacted]",
    );
  }
  if (!text) return null;
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : text;
}

function hasSessionToken(payload: unknown, depth = 0): boolean {
  if (depth > MAX_MESSAGE_DEPTH || !payload || typeof payload !== "object") return false;
  if (Array.isArray(payload)) {
    return payload.slice(0, 5).some((entry) => hasSessionToken(entry, depth + 1));
  }
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (SESSION_TOKEN_KEYS.has(key.toLowerCase()) && typeof value === "string" && value.trim()) {
      return true;
    }
    if (hasSessionToken(value, depth + 1)) return true;
  }
  return false;
}

function defaultMessage(
  step: SvpSessionStep,
  httpStatus: number,
  rejected: boolean,
  tokenReceived: boolean,
): string {
  if (!rejected) {
    if (step === "login") {
      return "SVP accepted the username and password. Enter the OTP sent to the registered email.";
    }
    return tokenReceived ? "Signed in to SVP." : "SVP accepted the OTP.";
  }
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 422) {
    return step === "login"
      ? "SVP rejected this username or password."
      : "SVP rejected this OTP. Check the code and try again.";
  }
  if (httpStatus >= 500) return "SVP is not responding right now. Try again shortly.";
  return `SVP returned HTTP ${httpStatus}.`;
}

/**
 * Read a real SVP login/OTP response and describe it without leaking values.
 * `redact` must include the submitted credentials so they can never be echoed back.
 */
export async function readSvpSessionResult(
  response: Response,
  step: SvpSessionStep,
  redact: string[] = [],
): Promise<SvpSessionResult> {
  const rawBody = await readBoundedResponseBody(response).catch(() => null);
  let payload: unknown = null;
  if (rawBody) {
    const trimmed = rawBody.trim();
    if (trimmed) {
      try {
        payload = JSON.parse(trimmed);
      } catch {
        payload = trimmed;
      }
    }
  }

  const errorText = sanitizeMessage(providerMessage(payload, ERROR_KEYS), redact);
  const infoText =
    sanitizeMessage(providerMessage(payload, MESSAGE_KEYS), redact) ?? errorText ?? null;
  const tokenReceived = hasSessionToken(payload);
  const rejected = !response.ok || Boolean(errorText);

  return {
    step,
    httpStatus: response.status,
    ok: !rejected,
    otpRequired: step === "login" && !rejected,
    authenticated: step === "otp" && !rejected,
    message: infoText ?? defaultMessage(step, response.status, rejected, tokenReceived),
  };
}
