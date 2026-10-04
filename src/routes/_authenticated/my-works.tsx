import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileText } from "lucide-react";
import { worksQ, openTicket, fmtDhakaDateTime } from "@/lib/works";
import { ttcQ, occQ, lookup, bn } from "@/lib/data";
import { StatusPill, SvpPill } from "@/components/app/WorkBits";
import { Button } from "@/components/ui/button";
import { WorkNotes } from "@/components/app/WorkNotes";

type Tab = "all" | "pending_approval" | "approved" | "rejected" | "svp";

export const Route = createFileRoute("/_authenticated/my-works")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({ tab: (s.tab as Tab) || undefined }),
  head: () => ({
    meta: [
      { title: "আমার জমা দেওয়া কাজ — এজেন্ট" },
      { name: "description", content: "এজেন্টের জমা দেওয়া কাজ, অনুমোদন অবস্থা ও SVP রেজাল্ট।" },
      { property: "og:title", content: "আমার জমা দেওয়া কাজ — এজেন্ট" },
      { property: "og:description", content: "এজেন্টের জমা দেওয়া কাজ, অনুমোদন অবস্থা ও SVP রেজাল্ট।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyWorks,
});

const TABS: [Tab, string][] = [["all", "সব কাজ"], ["pending_approval", "অপেক্ষমান"], ["approved", "অনুমোদিত"], ["rejected", "বাতিল"], ["svp", "SVP রেজাল্ট"]];

function MyWorks() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "all");
  const { data: works = [] } = useQuery(worksQ);
  const ttc = lookup(useQuery(ttcQ).data);
  const occ = lookup(useQuery(occQ).data);
  const list = tab === "all" ? works : tab === "svp" ? works.filter((w) => w.status === "approved") : works.filter((w) => w.status === tab);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-2xl font-bold">আমার জমা দেওয়া কাজ</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${tab === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
            {l} ({bn(k === "all" ? works.length : k === "svp" ? works.filter((w) => w.status === "approved").length : works.filter((w) => w.status === k).length)})
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">কোনো কাজ নেই।</p>
      ) : (
        <ul className="space-y-3">
          {list.map((w) => (
            <li key={w.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{w.candidate_name} <span className="text-sm font-normal text-muted-foreground">#{bn(w.ref_no)}</span></div>
                <div className="flex gap-2"><StatusPill status={w.status} />{w.status === "approved" && <SvpPill result={w.svp_result} />}</div>
              </div>
              <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                <span>পাসপোর্ট: {w.passport_no}</span>
                <span>পেশা: {w.occupation_id ? occ(w.occupation_id) : "—"}</span>
                <span>TTC: {w.ttc_id ? ttc(w.ttc_id) : "—"}</span>
                <span>পরীক্ষা: {fmtDhakaDateTime(w.exam_at)}</span>
                {w.svp_checked_at && <span>রেজাল্ট চেক: {fmtDhakaDateTime(w.svp_checked_at)}</span>}
              </div>
              {w.status === "rejected" && w.rejection_reason && (
                <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">বাতিলের কারণ: {w.rejection_reason}</p>
              )}
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => openTicket(w.ticket_path)}><FileText className="mr-1 h-4 w-4" /> Takamul Ticket</Button>
              <WorkNotes submissionId={w.id} canAdd />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
