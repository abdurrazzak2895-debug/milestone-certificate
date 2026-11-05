import { z } from "zod";
import { MAX_JSON_BODY_BYTES, readBoundedJson, releaseResponseBody } from "@/lib/bounded-json";

const API_BASE = "https://choice-pc-sv.xyz/api/external/takamol-availability/v1";

const categoryId = z.string().trim().min(1).max(80);
const city = z.string().trim().min(1).max(120);
const optionalCity = z.string().trim().max(120).optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  });

export const takamolLookupSchema = z.discriminatedUnion("endpoint", [
  z
    .object({
      endpoint: z.literal("occupations"),
      search: z.string().trim().max(120).optional(),
    })
    .strict(),
  z.object({ endpoint: z.literal("cities"), categoryId }).strict(),
  z.object({ endpoint: z.literal("dates"), categoryId, city }).strict(),
  z.object({ endpoint: z.literal("centers"), city: optionalCity }).strict(),
  z
    .object({
      endpoint: z.literal("sessions"),
      categoryId,
      city,
      examDate: isoDate,
      testCenterId: z.string().trim().max(120).optional(),
    })
    .strict(),
]);

export type TakamolLookupRequest = z.infer<typeof takamolLookupSchema>;

export type TakamolJsonValue =
  | string
  | number
  | boolean
  | null
  | TakamolJsonValue[]
  | {
      [key: string]: TakamolJsonValue;
    };

export type TakamolLookupResult =
  { success: true; data: TakamolJsonValue } | { success: false; status: number; message: string };

export function buildTakamolUrl(request: TakamolLookupRequest): URL {
  const url = new URL(`${API_BASE}/${request.endpoint}`);

  switch (request.endpoint) {
    case "occupations":
      if (request.search) url.searchParams.set("search", request.search);
      break;
    case "cities":
      url.searchParams.set("category_id", request.categoryId);
      break;
    case "dates":
      url.searchParams.set("category_id", request.categoryId);
      url.searchParams.set("city", request.city);
      break;
    case "centers":
      if (request.city) url.searchParams.set("city", request.city);
      break;
    case "sessions":
      url.searchParams.set("category_id", request.categoryId);
      url.searchParams.set("city", request.city);
      url.searchParams.set("exam_date", request.examDate);
      if (request.testCenterId) url.searchParams.set("test_center_id", request.testCenterId);
      break;
  }

  return url;
}

export function takamolErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return "Takamol API key is invalid, revoked, or expired. Check the server configuration.";
    case 422:
      return "The Takamol gateway rejected the query parameters. Check the category, city, date, or center.";
    case 429:
      return "Takamol API rate limit reached. Wait briefly before trying again.";
    case 502:
      return "Takamol availability is temporarily unavailable. Try again later.";
    case 529:
      return "The Takamol availability service is overloaded. Try again shortly.";
    default:
      return "Takamol availability request failed. Check the server configuration and try again.";
  }
}

function isTakamolJsonValue(value: unknown): value is TakamolJsonValue {
  if (value === null) return true;

  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object": {
      if (Array.isArray(value)) return value.every(isTakamolJsonValue);
      const prototype = Object.getPrototypeOf(value);
      return (
        (prototype === Object.prototype || prototype === null) &&
        Object.values(value).every(isTakamolJsonValue)
      );
    }
    default:
      return false;
  }
}

export function unwrapTakamolResponse(
  payload: unknown,
): { success: true; data: TakamolJsonValue } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const response = payload as Record<string, unknown>;
  if (response.success !== true || !Object.prototype.hasOwnProperty.call(response, "data")) {
    return null;
  }
  if (!isTakamolJsonValue(response.data)) return null;

  return { success: true, data: response.data };
}

/**
 * Transient gateway statuses that are retried with backoff, mirroring the SVP
 * client's retry budget for GET failures (429/5xx, including 529).
 */
const TAKAMOL_RETRYABLE_STATUSES = new Set([429, 502, 503, 504, 529]);

export type TakamolFetchOptions = {
  /** Per-attempt timeout in milliseconds (default 15s). */
  timeoutMs?: number;
  /** Retry budget for transient statuses (default 2). */
  maxRetries?: number;
  /** Backoff base in milliseconds; attempt n waits n × base (default 1500). */
  backoffMs?: number;
};

/** GET with per-attempt timeout and bounded retries on transient Takamol statuses. */
export async function fetchTakamolWithRetry(
  url: URL,
  apiKey: string,
  options: TakamolFetchOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 2;
  const backoffMs = options.backoffMs ?? 1500;

  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-Takamol-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!TAKAMOL_RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }
      // Release the failed response body in both cases: an unconsumed body pins
      // a pooled connection while backing off, and the response handed back once
      // the retry budget is exhausted is only inspected for its status code.
      await releaseTakamolBody(response);
      if (attempt >= maxRetries) return response;
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, attempt * backoffMs));
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Hard bound on a Takamol JSON body, in bytes. */
export const TAKAMOL_MAX_BODY_BYTES = MAX_JSON_BODY_BYTES;

/** Release a Takamol response body that will not be read. */
export async function releaseTakamolBody(response: Response): Promise<void> {
  await releaseResponseBody(response);
}

/**
 * Read a Takamol JSON response with a hard size bound (shared streaming reader).
 * Oversized or malformed payloads collapse to null so the caller maps them to an error.
 */
export async function readTakamolJson(
  response: Response,
  maxBytes: number = TAKAMOL_MAX_BODY_BYTES,
): Promise<unknown> {
  return readBoundedJson(response, maxBytes);
}
