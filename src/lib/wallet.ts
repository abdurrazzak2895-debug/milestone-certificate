import { supabase } from "@/integrations/supabase/client";

export type DepositRequestResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Create a pending deposit request. Uses the SECURITY DEFINER RPC first and falls back
 * to a direct insert (older deployments) so the request is never silently lost.
 */
export async function requestWalletDeposit(input: {
  amount: number;
  method: string;
  reference?: string | null;
  note?: string | null;
}): Promise<DepositRequestResult> {
  const { data, error } = await supabase.rpc("wallet_request_deposit", {
    _amount: input.amount,
    _method: input.method,
    _reference: input.reference?.trim() || undefined,
    _note: input.note?.trim() || undefined,
  });
  if (!error) {
    const result = data as { ok?: boolean; id?: string; reason?: string } | null;
    if (result && result.ok === false) {
      return { ok: false, message: result.reason ?? "request_rejected" };
    }
    return { ok: true, id: String(result?.id ?? "") };
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, message: "signed_out" };

  const fallback = await supabase
    .from("wallet_deposits")
    .insert({
      user_id: auth.user.id,
      amount: input.amount,
      method: input.method,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();
  if (fallback.error) {
    return { ok: false, message: describeWalletError(fallback.error.message) };
  }
  return { ok: true, id: String(fallback.data?.id ?? "") };
}

/** Turn database setup errors into a clear, actionable message. */
export function describeWalletError(message: string): string {
  if (/schema cache|could not find the table|does not exist/i.test(message)) {
    return "Wallet সিস্টেম database-এ setup হয়নি (wallet_deposits টেবিল নেই)। Supabase SQL Editor-এ supabase/manual/apply_wallet_system.sql ফাইলটি Run করুন।";
  }
  return message;
}
