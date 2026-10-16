import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Work = Database["public"]["Tables"]["job_submissions"]["Row"];

export const STATUS_LABEL: Record<string, string> = {
  pending_approval: "অপেক্ষমান",
  pending_agent: "এজেন্টের অনুমোদনের অপেক্ষায়",
  approved: "অনুমোদিত",
  rejected: "বাতিল",
  not_arrived: "এখনো আসেননি",
  received: "রিসিভ করা হয়েছে",
  absent: "অনুপস্থিত",
};
export const STATUS_CLS: Record<string, string> = {
  pending_approval: "bg-muted text-foreground",
  pending_agent: "bg-accent text-accent-foreground",
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
    // Page through results so lists are never cut off at the default row limit.
    const data: Work[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await supabase.from("job_submissions").select("*").order("exam_at", { ascending: true }).order("id").range(from, from + 999);
      if (error) throw error;
      data.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    return (data ?? []).map((w) => ({ ...w, candidate_name: (w.candidate_name ?? "").toUpperCase(), passport_no: (w.passport_no ?? "").toUpperCase() })) as Work[];
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
  const { data, error } = await supabase.storage.from("candidate-photos").createSignedUrl(path, 300, { download: path.split("/").pop() || "ticket.pdf" });
  if (error || !data?.signedUrl) throw error ?? new Error("no signed url");
  // Fetch to a blob so the file downloads reliably instead of being blocked as a popup.
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error("download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || "ticket.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function fmtDhakaDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
}
