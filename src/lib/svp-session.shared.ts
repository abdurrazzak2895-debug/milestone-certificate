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
export type SvpSessionSummary = {
  userName: string | null;
  login: string;
  /** Epoch seconds when the stored SVP access token expires. */
  expiresAt: number;
};

export type SvpSessionResult = {
  step: SvpSessionStep;
  httpStatus: number;
  ok: boolean;
  otpRequired: boolean;
  authenticated: boolean;
  message: string;
  session: SvpSessionSummary | null;
  details?: string;
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
    session: null,
  };
}

export type SvpAuthPayload = {
  access: string;
  /** Epoch seconds when the bearer token expires. */
  accessExpiresAt: number;
};

export type SvpSessionUser = {
  id: string | null;
  name: string | null;
  passport: string | null;
  countryTargeted: boolean | null;
  countryLoadBalancer: boolean | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readExpiry(value: unknown): number {
  const now = Math.floor(Date.now() / 1000);
  const normalize = (numeric: number): number => {
    if (numeric > 10_000_000_000) return Math.floor(numeric / 1000); // epoch milliseconds
    if (numeric > 1_000_000_000) return Math.floor(numeric); // epoch seconds
    if (numeric > 0) return now + Math.floor(numeric); // duration in seconds
    return 0;
  };
  if (typeof value === "number" && Number.isFinite(value)) return normalize(value);
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return normalize(numeric);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return 0;
}

/** Extract the bearer token from the real SVP OTP/refresh payload shapes. */
export function extractSvpAuthPayload(payload: unknown): SvpAuthPayload | null {
  const root = asRecord(payload);
  if (!root) return null;
  // Prefer the canonical root-level access_payload, then a data envelope.
  const candidates = [root, asRecord(root["data"])];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const token = asRecord(candidate["access_payload"]) ?? candidate;
    const access =
      typeof token["access"] === "string"
        ? token["access"]
        : typeof token["access_token"] === "string"
          ? token["access_token"]
          : null;
    if (!access) continue;
    return {
      access: access.trim(),
      accessExpiresAt:
        readExpiry(token["access_expires_at"]) ||
        readExpiry(token["expires_at"]) ||
        Math.floor(Date.now() / 1000) + 3000,
    };
  }
  return null;
}

/** Normalize only an explicitly named passport value; never infer it from IDs or tokens. */
export function normalizeSvpPassport(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  // Passports are often formatted with spaces ("A0 1234567"); keep the identifier only.
  const trimmed = String(value).trim().replace(/\s+/g, "");
  if (!/^[A-Za-z0-9]{5,20}$/.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

const PASSPORT_KEY = /passport/i;
const PASSPORT_SKIP_KEY =
  /(expiry|expiration|expire|issued|issue|country|type|status|image|photo|file|url|path|hash|id)/i;

/**
 * Find the passport anywhere in a provider payload (profiles are nested differently per
 * endpoint). Values under non-passport keys such as expiry dates are ignored.
 */
export function findSvpPassport(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== "object") return null;
  const record = asRecord(value);
  if (!record) return null;

  for (const [key, nested] of Object.entries(record)) {
    if (!PASSPORT_KEY.test(key) || PASSPORT_SKIP_KEY.test(key)) continue;
    const direct = normalizeSvpPassport(nested);
    if (direct) return direct;
    const inner = asRecord(nested);
    if (inner) {
      for (const innerKey of ["number", "no", "value", "passport_number", "passport_no"]) {
        const found = normalizeSvpPassport(inner[innerKey]);
        if (found) return found;
      }
    }
  }

  for (const nested of Object.values(record)) {
    const found = findSvpPassport(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Read the signed-in labor identity from the OTP response. */
export function extractSvpSessionUser(payload: unknown): SvpSessionUser {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]) ?? root;
  const user = asRecord(data?.["user"]);
  const profile = asRecord(user?.["profile"]) ?? asRecord(data?.["profile"]);
  const country = asRecord(user?.["country"]) ?? asRecord(data?.["country"]);
  const idValue = user?.["id"] ?? data?.["user_id"] ?? profile?.["id"];
  const nameValue =
    user?.["full_name"] ?? user?.["name"] ?? profile?.["full_name"] ?? profile?.["name"];
  const passport =
    [
      user?.["passport_number"],
      user?.["passport_no"],
      user?.["passport"],
      profile?.["passport_number"],
      profile?.["passport_no"],
      profile?.["passport"],
    ]
      .map(normalizeSvpPassport)
      .find((value): value is string => value !== null) ??
    findSvpPassport(data) ??
    findSvpPassport(root);
  return {
    id: idValue === undefined || idValue === null ? null : String(idValue),
    name: typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : null,
    passport,
    countryTargeted:
      typeof country?.["targeted"] === "boolean" ? (country["targeted"] as boolean) : null,
    countryLoadBalancer:
      typeof country?.["load_balancer"] === "boolean"
        ? (country["load_balancer"] as boolean)
        : null,
  };
}

/** Convert a provider error payload into one safe, readable line. */
export function svpErrorMessage(payload: unknown, redact: string[] = []): string | null {
  const errorText = sanitizeMessage(providerMessage(payload, ERROR_KEYS), redact);
  if (errorText) return errorText;
  return sanitizeMessage(providerMessage(payload, MESSAGE_KEYS), redact);
}
