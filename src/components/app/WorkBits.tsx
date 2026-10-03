import { STATUS_CLS, STATUS_LABEL, SVP_LABEL } from "@/lib/works";

export function StatusPill({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[status] ?? "bg-muted"}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function SvpPill({ result }: { result: string }) {
  const cls = result === "PASS" ? "bg-primary/15 text-primary" : result === "FAIL" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>SVP: {SVP_LABEL[result] ?? result}</span>;
}
