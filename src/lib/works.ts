import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Work = Database["public"]["Tables"]["job_submissions"]["Row"];

export const STATUS_LABEL: Record<string, string> = {
  pending_approval: "অপেক্ষমান",
  approved: "অনুমোদিত",
  rejected: "বাতিল",
  not_arrived: "এখনো আসেননি",
  received: "রিসিভ করা হয়েছে",
  absent: "অনুপস্থিত",
};
export const STATUS_CLS: Record<string, string> = {
  pending_approval: "bg-muted text-foreground",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
  not_arrived: "bg-muted text-muted-foreground",
  received: "bg-primary/15 text-primary",
  absent: "bg-destructive/15 text-destructive",
};
export const SVP_LABEL: Record<string, string> = { PASS: "PASS", FAIL: "FAIL", PENDING: "PENDING", NOT_FOUND: "NOT FOUND" };

/** RLS decides which rows come back: agent = own, provider = approved, staff = all. */
export const worksQ = queryOptions({
  queryKey: ["works"],
  refetchInterval: 5 * 60 * 1000,
  queryFn: async () => {
    const { data, error } = await supabase.from("job_submissions").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data as Work[];
  },
});

export const myAccountQ = queryOptions({
  queryKey: ["my-account"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data } = await supabase.from("agent_accounts").select("*").eq("user_id", u.user.id).maybeSingle();
    return data;
  },
});

export async function openTicket(path: string) {
  const { data } = await supabase.storage.from("candidate-photos").createSignedUrl(path, 300);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
}

export function fmtDhakaDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
}
