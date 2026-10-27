import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TABLES = ["agent_accounts", "wallet_accounts", "wallet_transactions", "wallet_deposits"];

/** Report which wallet/account tables are missing from the database (setup diagnostics). */
export const checkWalletSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async (): Promise<{ ready: boolean; missing: string[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const missing: string[] = [];
    for (const table of TABLES) {
      const { error } = await supabaseAdmin
        .from(table as "wallet_deposits")
        .select("*", { head: true, count: "exact" })
        .limit(1);
      if (
        error &&
        /schema cache|could not find the table|does not exist|not find the table/i.test(
          error.message,
        )
      ) {
        missing.push(table);
      }
    }
    return { ready: missing.length === 0, missing };
  });
