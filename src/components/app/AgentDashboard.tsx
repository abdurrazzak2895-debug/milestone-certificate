import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, CheckCircle2, Clock, FilePlus2, ListChecks, XCircle, Award, User } from "lucide-react";
import { worksQ, myAccountQ } from "@/lib/works";
import { bn, occQ, lookup } from "@/lib/data";
import { CandidatePhoto } from "@/components/app/CandidatePhoto";

const dhakaDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
const dayOffset = (n: number) => dhakaDay(new Date(Date.now() + n * 86400000));
const fmtT = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
const DAYS = [[0, "আজ"], [1, "আগামীকাল"], [2, "পরশু"]] as const;

export function AgentDashboard() {
  const { data: works = [] } = useQuery(worksQ);
  const { data: me } = useQuery(myAccountQ);
  const occ = lookup(useQuery(occQ).data);
  const [day, setDay] = useState<0 | 1 | 2>(0);
  const count = (s: string) => works.filter((w) => w.status === s).length;
  const cards = [
    { label: "আমার সব কাজ", value: works.length, icon: ListChecks, tab: "all" },
    { label: "অপেক্ষমান", value: count("pending_approval"), icon: Clock, tab: "active" },
    { label: "অনুমোদিত", value: count("approved"), icon: CheckCircle2, tab: "active" },
    { label: "বাতিল", value: count("rejected"), icon: XCircle, tab: "rejected" },
    { label: "SVP PASS", value: works.filter((w) => w.svp_result === "PASS").length, icon: Award, tab: "done" },
  ] as const;
  const onDay = (n: number) =>
    works
      .filter((w) => w.status !== "rejected" && !!w.exam_at && dhakaDay(new Date(w.exam_at)) === dayOffset(n))
      .sort((a, b) => a.exam_at.localeCompare(b.exam_at));
  const list = onDay(day);

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

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Bell className="h-4 w-4 text-primary" /> পরীক্ষার রিমাইন্ডার</h2>
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {DAYS.map(([n, l]) => (
            <button key={n} onClick={() => setDay(n)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${day === n ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              {l} ({bn(onDay(n).length)})
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">এই দিনে কোনো পরীক্ষা নেই।</p>
        ) : (
          <ul className="divide-y">
            {list.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-2.5">
                <CandidatePhoto path={w.candidate_photo_path} name={w.candidate_name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{w.candidate_name} <span className="text-xs font-normal text-muted-foreground">#{w.ref_code}</span></div>
                  <div className="truncate text-xs text-muted-foreground">{w.passport_no} · {w.mobile} · {w.occupation_id ? occ(w.occupation_id) : "—"}</div>
                </div>
                <div className="text-right text-sm font-semibold">{fmtT(w.exam_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
