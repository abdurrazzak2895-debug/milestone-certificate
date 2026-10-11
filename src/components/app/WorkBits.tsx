import { STATUS_CLS, STATUS_LABEL } from "@/lib/works";

export function StatusPill({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[status] ?? "bg-muted"}`}>{STATUS_LABEL[status] ?? status}</span>;
}

const SVP: Record<string, [string, string]> = {
  PASS: ["✅ Pass", "bg-primary/15 text-primary"],
  FAIL: ["❌ Fail", "bg-destructive/15 text-destructive"],
  PENDING: ["⏳ Pending", "bg-muted text-muted-foreground"],
  NOT_FOUND: ["⚠️ Result Not Found", "bg-warning-soft text-warning"],
};

type W = { svp_result: string; svp_exam_date?: string | null; svp_old_result?: string | null };

export function SvpPill({ result, work, checking }: { result: string; work?: W; checking?: boolean }) {
  if (checking) return <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold animate-pulse">🔄 Checking</span>;
  const [label, cls] = SVP[result] ?? [result, "bg-muted"];
  const d = work?.svp_exam_date ? new Date(work.svp_exam_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}{d && !work?.svp_old_result && (result === "PASS" || result === "FAIL") ? ` · ${d}` : ""}</span>
      {work?.svp_old_result && d && <span className="rounded-full border border-warning px-2 py-0.5 text-[11px] text-warning">পুরোনো রেজাল্ট: {work.svp_old_result} ({d})</span>}
    </span>
  );
}
