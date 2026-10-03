import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, FilePlus2, ListChecks, XCircle, Award, User } from "lucide-react";
import { worksQ, myAccountQ } from "@/lib/works";
import { bn } from "@/lib/data";

export function AgentDashboard() {
  const { data: works = [] } = useQuery(worksQ);
  const { data: me } = useQuery(myAccountQ);
  const count = (s: string) => works.filter((w) => w.status === s).length;
  const cards = [
    { label: "আমার সব কাজ", value: works.length, icon: ListChecks, tab: "all" },
    { label: "অপেক্ষমান", value: count("pending_approval"), icon: Clock, tab: "pending_approval" },
    { label: "অনুমোদিত", value: count("approved"), icon: CheckCircle2, tab: "approved" },
    { label: "বাতিল", value: count("rejected"), icon: XCircle, tab: "rejected" },
    { label: "SVP PASS", value: works.filter((w) => w.svp_result === "PASS").length, icon: Award, tab: "svp" },
  ] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="font-display text-2xl font-bold">এজেন্ট ড্যাশবোর্ড</h1>
      <section className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary"><User className="h-6 w-6" /></div>
        <div>
          <div className="font-semibold">{me?.full_name ?? "—"}</div>
          <div className="text-sm text-muted-foreground">Agent ID: {me?.agent_code ?? "—"} · {me?.mobile ?? ""}</div>
        </div>
      </section>
      <Link to="/submit-job" className="flex items-center justify-center gap-2 rounded-2xl bg-primary p-4 font-semibold text-primary-foreground shadow-sm">
        <FilePlus2 className="h-5 w-5" /> Submit Work
      </Link>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to="/my-works" search={{ tab: c.tab }} className="rounded-2xl border bg-card p-4 shadow-sm hover:bg-muted">
            <c.icon className="h-5 w-5 text-primary" />
            <div className="mt-2 text-2xl font-bold">{bn(c.value)}</div>
            <div className="text-sm text-muted-foreground">{c.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
