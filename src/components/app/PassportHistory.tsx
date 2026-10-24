import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDhakaDateTime, STATUS_LABEL } from "@/lib/works";

export type PassportRow = {
  ref_code: string;
  status: string;
  svp_result: string;
  exam_at: string;
  created_at: string;
  occupation: string | null;
  blocking: boolean;
};

export const passportHistoryQ = (passport: string) => ({
  queryKey: ["passport-history", passport.trim().toUpperCase()],
  enabled: passport.trim().length >= 5,
  staleTime: 15_000,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("passport_history", { _passport: passport.trim() });
    if (error) throw error;
    return (data ?? []) as PassportRow[];
  },
});

/** Shows every earlier submission for a passport (across all IDs) with its result. */
export function PassportHistory({
  passport,
  excludeRef,
}: {
  passport: string;
  excludeRef?: string;
}) {
  const { data = [] } = useQuery(passportHistoryQ(passport));
  const rows = data.filter((r) => r.ref_code !== excludeRef);
  if (rows.length === 0) return null;
  const blocked = rows.some((r) => r.blocking);
  return (
    <div
      className={`mt-2 rounded-lg border p-2 text-xs ${blocked ? "border-destructive/50 bg-destructive/10" : "border-accent bg-accent/30"}`}
    >
      <div
        className={`mb-1 flex items-center gap-1 font-semibold ${blocked ? "text-destructive" : ""}`}
      >
        <History className="h-3.5 w-3.5" />
        {blocked
          ? "⚠️ এই পাসপোর্ট আগে জমা দেওয়া আছে — আবার জমা দেওয়া যাবে না"
          : `এই পাসপোর্ট আগে ${rows.length} বার জমা হয়েছিল (পূর্বের ইতিহাস)`}
      </div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.ref_code} className="flex flex-wrap gap-x-2">
            <span className="font-medium">#{r.ref_code}</span>
            <span>{r.occupation ?? "—"}</span>
            <span>পরীক্ষা: {fmtDhakaDateTime(r.exam_at)}</span>
            <span>{STATUS_LABEL[r.status] ?? r.status}</span>
            <span
              className={
                r.svp_result === "PASS"
                  ? "font-bold text-primary"
                  : r.svp_result === "FAIL"
                    ? "font-bold text-destructive"
                    : ""
              }
            >
              ফল: {r.svp_result}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
