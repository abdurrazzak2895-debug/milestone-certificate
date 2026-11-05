import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildTakamolUrl,
  fetchTakamolWithRetry,
  readTakamolJson,
  releaseTakamolBody,
  takamolErrorMessage,
  takamolLookupSchema,
  unwrapTakamolResponse,
  type TakamolLookupResult,
} from "@/lib/takamol-availability.shared";

/** Resolve the key from the platform env or the Vite-injected env (dev). */
function takamolApiKey(): string | null {
  const candidates = [
    process.env["TAKAMOL_API_KEY"],
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[
      "TAKAMOL_API_KEY"
    ],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

export const lookupTakamolAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => takamolLookupSchema.parse(input))
  .handler(async ({ data, context }): Promise<TakamolLookupResult> => {
    try {
      const { data: roles, error } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      if (error) {
        return {
          success: false,
          status: 503,
          message: "Authorized role lookup is not available on the server.",
        };
      }
      if (!roles?.some(({ role }) => role === "admin" || role === "staff" || role === "agent")) {
        return {
          success: false,
          status: 403,
          message: "Only authorized admin, staff, or agent users may use this lookup.",
        };
      }
    } catch {
      return {
        success: false,
        status: 503,
        message: "Authorized role lookup is not available on the server.",
      };
    }

    const apiKey = takamolApiKey();
    if (!apiKey) {
      return {
        success: false,
        status: 503,
        message:
          "Takamol availability is not configured. Add TAKAMOL_API_KEY to the server environment.",
      };
    }

    try {
      // Transient gateway failures (429/5xx, including 529) are retried with
      // backoff before giving up, mirroring the SVP client's retry budget.
      const response = await fetchTakamolWithRetry(buildTakamolUrl(data), apiKey);

      if (!response.ok) {
        // The error body is never read, so release it to free the connection.
        await releaseTakamolBody(response);
        return {
          success: false,
          status: response.status,
          message: takamolErrorMessage(response.status),
        };
      }

      // Streaming bounded read: an oversized or malformed gateway payload
      // becomes a 502 instead of exhausting server memory, exactly like the
      // SVP client.
      const payload = await readTakamolJson(response);
      const result = unwrapTakamolResponse(payload);
      if (!result) {
        return {
          success: false,
          status: 502,
          message: takamolErrorMessage(502),
        };
      }

      return result;
    } catch {
      return {
        success: false,
        status: 502,
        message: takamolErrorMessage(502),
      };
    }
  });
