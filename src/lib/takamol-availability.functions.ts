import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildTakamolUrl,
  takamolErrorMessage,
  takamolLookupSchema,
  unwrapTakamolResponse,
  type TakamolLookupResult,
} from "@/lib/takamol-availability.shared";

const REQUEST_TIMEOUT_MS = 15_000;

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
          message: "Admin/staff role lookup is not available on the server.",
        };
      }
      if (!roles?.some(({ role }) => role === "admin" || role === "staff")) {
        return {
          success: false,
          status: 403,
          message: "Only authorized admin or staff users may use this lookup.",
        };
      }
    } catch {
      return {
        success: false,
        status: 503,
        message: "Admin/staff role lookup is not available on the server.",
      };
    }

    const apiKey = process.env["TAKAMOL_API_KEY"]?.trim();
    if (!apiKey) {
      return {
        success: false,
        status: 503,
        message:
          "Takamol availability is not configured. Add TAKAMOL_API_KEY to the server environment.",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(buildTakamolUrl(data), {
        method: "GET",
        headers: {
          "X-Takamol-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          message: takamolErrorMessage(response.status),
        };
      }

      const payload: unknown = await response.json().catch(() => null);
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
    } finally {
      clearTimeout(timeout);
    }
  });
