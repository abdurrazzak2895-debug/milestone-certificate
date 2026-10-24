// Server-only SVP web-session storage and authenticated API transport.
// The SVP bearer token and refresh cookies never reach the browser: they live in
// an httpOnly, per-app-user cookie handled exclusively by server functions.
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  extractSvpAuthPayload,
  svpErrorMessage,
  type SvpAuthPayload,
} from "@/lib/svp-session.shared";

export const SVP_API_BASE = "https://svp-international-api.pacc.sa/api/v1";
export const SVP_PORTAL_URL = "https://svp-international.qiwa.sa";

const SESSION_COOKIE_PREFIX = "svp_session_";
const PENDING_COOKIE_PREFIX = "svp_pending_";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const PENDING_TTL_SECONDS = 60 * 15;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 512 * 1024;

export class SvpSessionMissingError extends Error {
  constructor() {
    super("Sign in to SVP first.");
    this.name = "SvpSessionMissingError";
  }
}

export type SvpSessionInfo = {
  login: string;
  userName: string | null;
  svpUserId: string | null;
  expiresAt: number;
};

export type SvpStoredSession = SvpSessionInfo & {
  access: string;
  refreshCookies: string;
  savedAt: number;
};

export type SvpPendingSession = {
  login: string;
  refreshCookies: string;
  savedAt: number;
};

export type SvpApiResponse = {
  ok: boolean;
  status: number;
  payload: unknown;
  message: string | null;
};

function cookieSuffix(appUserId: string) {
  return appUserId.replace(/[^A-Za-z0-9_-]/g, "");
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function safeParse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readStoredSvpSession(appUserId: string): SvpStoredSession | null {
  const parsed = safeParse<SvpStoredSession>(
    getCookie(`${SESSION_COOKIE_PREFIX}${cookieSuffix(appUserId)}`),
  );
  if (!parsed?.access || !parsed.login) return null;
  return parsed;
}

export function writeStoredSvpSession(appUserId: string, session: SvpStoredSession): void {
  setCookie(
    `${SESSION_COOKIE_PREFIX}${cookieSuffix(appUserId)}`,
    JSON.stringify(session),
    cookieOptions(SESSION_TTL_SECONDS),
  );
}

export function clearStoredSvpSession(appUserId: string): void {
  const suffix = cookieSuffix(appUserId);
  deleteCookie(`${SESSION_COOKIE_PREFIX}${suffix}`, { path: "/" });
  deleteCookie(`${PENDING_COOKIE_PREFIX}${suffix}`, { path: "/" });
}

export function readPendingSvpSession(appUserId: string): SvpPendingSession | null {
  return safeParse<SvpPendingSession>(
    getCookie(`${PENDING_COOKIE_PREFIX}${cookieSuffix(appUserId)}`),
  );
}

export function writePendingSvpSession(appUserId: string, pending: SvpPendingSession): void {
  setCookie(
    `${PENDING_COOKIE_PREFIX}${cookieSuffix(appUserId)}`,
    JSON.stringify(pending),
    cookieOptions(PENDING_TTL_SECONDS),
  );
}

function cookiePairs(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const raw =
    typeof withGetSetCookie.getSetCookie === "function"
      ? withGetSetCookie.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie") as string]
        : [];
  return raw
    .map((entry) => entry.split(";", 1)[0]?.trim())
    .filter((entry): entry is string => Boolean(entry && entry.includes("=")));
}

export function mergeCookiePairs(existing: string, incoming: string[]): string {
  const merged = new Map<string, string>();
  const add = (pair: string) => {
    const index = pair.indexOf("=");
    if (index <= 0) return;
    merged.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  };
  for (const pair of existing.split(";")) add(pair.trim());
  for (const pair of incoming) add(pair);
  return [...merged.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export function responseCookies(response: Response): string[] {
  return cookiePairs(response.headers);
}

async function readBoundedBody(response: Response): Promise<unknown> {
  const text = (await response.text()).slice(0, MAX_BODY_BYTES);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

const BASE_HEADERS = {
  Accept: "application/json",
  Origin: SVP_PORTAL_URL,
  Referer: `${SVP_PORTAL_URL}/`,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
} as const;

function apiUrl(path: string, query?: Record<string, string | number | null | undefined>) {
  const url = new URL(path.replace(/^\//, ""), `${SVP_API_BASE}/`);
  url.searchParams.set("locale", "en");
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function svpLoginRequest(
  path: "/sessions/login" | "/sessions/otp",
  body: unknown,
): Promise<{ response: Response; payload: unknown; message: string | null }> {
  const response = await timedFetch(apiUrl(path), {
    method: "POST",
    headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readBoundedBody(response);
  return { response, payload, message: svpErrorMessage(payload) };
}

async function refreshStoredSession(
  appUserId: string,
  session: SvpStoredSession,
): Promise<SvpStoredSession> {
  if (!session.refreshCookies) {
    clearStoredSvpSession(appUserId);
    throw new SvpSessionMissingError();
  }
  let response: Response;
  try {
    response = await timedFetch(apiUrl("/refresh"), {
      method: "POST",
      headers: { ...BASE_HEADERS, Cookie: session.refreshCookies },
    });
  } catch {
    throw new SvpSessionMissingError();
  }
  if (!response.ok) {
    clearStoredSvpSession(appUserId);
    throw new SvpSessionMissingError();
  }
  const payload = await readBoundedBody(response);
  const auth = extractSvpAuthPayload(payload);
  if (!auth) {
    clearStoredSvpSession(appUserId);
    throw new SvpSessionMissingError();
  }
  const next: SvpStoredSession = {
    ...session,
    access: auth.access,
    expiresAt: auth.accessExpiresAt,
    refreshCookies: mergeCookiePairs(session.refreshCookies, responseCookies(response)),
    savedAt: Date.now(),
  };
  writeStoredSvpSession(appUserId, next);
  return next;
}

function authFromPayload(payload: unknown): SvpAuthPayload | null {
  return extractSvpAuthPayload(payload);
}

export function buildStoredSession(
  login: string,
  payload: unknown,
  refreshCookies: string,
  userName: string | null,
  svpUserId: string | null,
): SvpStoredSession | null {
  const auth = authFromPayload(payload);
  if (!auth) return null;
  return {
    login,
    userName,
    svpUserId,
    access: auth.access,
    expiresAt: auth.accessExpiresAt,
    refreshCookies,
    savedAt: Date.now(),
  };
}

/**
 * Perform an authenticated SVP request for the current app user.
 * Refreshes the bearer token once on 401 and persists rotated cookies.
 */
export async function svpAuthedRequest(
  appUserId: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: Record<string, string | number | null | undefined>;
    body?: unknown;
  } = {},
): Promise<SvpApiResponse> {
  let session = readStoredSvpSession(appUserId);
  if (!session) throw new SvpSessionMissingError();

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expiresAt - 30 <= nowSeconds) {
    session = await refreshStoredSession(appUserId, session);
  }

  const send = async (active: SvpStoredSession) => {
    const headers: Record<string, string> = {
      ...BASE_HEADERS,
      Authorization: `Bearer ${active.access}`,
    };
    if (active.refreshCookies) headers["Cookie"] = active.refreshCookies;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    return timedFetch(apiUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  };

  let response = await send(session);
  if (response.status === 401) {
    session = await refreshStoredSession(appUserId, session);
    response = await send(session);
  }

  const rotated = responseCookies(response);
  if (rotated.length > 0) {
    session = { ...session, refreshCookies: mergeCookiePairs(session.refreshCookies, rotated) };
  }
  writeStoredSvpSession(appUserId, session);

  const payload = await readBoundedBody(response);
  return {
    ok: response.ok,
    status: response.status,
    payload,
    message: response.ok
      ? null
      : (svpErrorMessage(payload) ?? `SVP returned HTTP ${response.status}.`),
  };
}

/** Shared role gate for every SVP booking server function. */
export async function requireSvpAllowedRole(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
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

export function clearPendingSvpSession(appUserId: string): void {
  deleteCookie(`${PENDING_COOKIE_PREFIX}${cookieSuffix(appUserId)}`, { path: "/" });
}
