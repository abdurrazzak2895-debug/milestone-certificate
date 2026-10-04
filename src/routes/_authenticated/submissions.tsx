import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, FileText, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { worksQ, openTicket, fmtDhakaDateTime, type Work } from "@/lib/works";
import { ttcQ, occQ, lookup, bn } from "@/lib/data";
import { checkSubmissionSvp } from "@/lib/svp.functions";
import { listAccounts } from "@/lib/accounts.functions";
import { StatusPill, SvpPill } from "@/components/app/WorkBits";
import { Button } from "@/components/ui/button";
import { WorkNotes } from "@/components/app/WorkNotes";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/submissions")({
  head: () => ({
    meta: [
      { title: "Submitted Works — অ্যাডমিন অনুমোদন" },
      { name: "description", content: "এজেন্টদের জমা দেওয়া কাজ যাচাই, অনুমোদন বা বাতিল।" },
      { property: "og:title", content: "Submitted Works — অ্যাডমিন অনুমোদন" },
      { property: "og:description", content: "এজেন্টদের জমা দেওয়া কাজ যাচাই, অনুমোদন বা বাতিল।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Submissions,
});

const FILTERS: [string, string][] = [["pending_approval", "অপেক্ষমান"], ["approved", "অনুমোদিত"], ["rejected", "বাতিল"], ["all", "সব"]];

function Submissions() {
  const qc = useQueryClient();
  const { data: works = [] } = useQuery(worksQ);
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: () => listAccounts(), retry: false });
  const ttc = lookup(useQuery(ttcQ).data);
  const occ = lookup(useQuery(occQ).data);
  const [filter, setFilter] = useState("pending_approval");
  const [rejecting, setRejecting] = useState<Work | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const agentName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.name}${a.agent_code ? ` (${a.agent_code})` : ""}` : "—"; };
  const list = filter === "all" ? works : works.filter((w) => w.status === filter);

  const review = async (w: Work, status: "approved" | "rejected", why?: string) => {
    setBusyId(w.id);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("job_submissions").update({
      status, rejection_reason: status === "rejected" ? why ?? null : null, reviewed_by: u.user?.id ?? null, reviewed_at: new Date().toISOString(),
    }).eq("id", w.id);
    setBusyId(null);
    if (error) return toast.error("আপডেট করা যায়নি");
    toast.success(status === "approved" ? "অনুমোদন করা হয়েছে" : "বাতিল করা হয়েছে");
    qc.invalidateQueries({ queryKey: ["works"] });
  };

  const svp = async (w: Work) => {
    setBusyId(w.id);
    const r = await checkSubmissionSvp({ data: { id: w.id } }).catch(() => ({ status: "error" as const, message: "চেক করা যায়নি" }));
    setBusyId(null);
    if (r.status === "error") toast.error(r.message);
    else toast.success(r.status === "found" ? `SVP রেজাল্ট: ${r.result}` : "SVP-তে রেজাল্ট পাওয়া যায়নি");
    qc.invalidateQueries({ queryKey: ["works"] });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="font-display text-2xl font-bold">Submitted Works</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${filter === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
            {l} ({bn(k === "all" ? works.length : works.filter((w) => w.status === k).length)})
          </button>
        ))}
      </div>
      {list.length === 0 ? <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">কোনো কাজ নেই।</p> : (
        <ul className="space-y-3">
          {list.map((w) => (
            <li key={w.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{w.candidate_name} <span className="text-sm font-normal text-muted-foreground">#{bn(w.ref_no)}</span></div>
                <div className="flex gap-2"><StatusPill status={w.status} />{w.status === "approved" && <SvpPill result={w.svp_result} />}</div>
              </div>
              <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                <span>এজেন্ট: {agentName(w.submitted_by)}</span>
                <span>পাসপোর্ট: {w.passport_no}</span>
                <span>মোবাইল: {w.mobile}</span>
                <span>পেশা: {occ(w.occupation_id)}</span>
                <span>TTC: {ttc(w.ttc_id)}</span>
                <span>পরীক্ষা: {fmtDhakaDateTime(w.exam_at)}</span>
                <span>শিক্ষা: {w.education === "educated" ? "শিক্ষিত" : "অশিক্ষিত"}</span>
                <span>অভিজ্ঞতা: {w.experience === "yes" ? "আছে" : "নেই"}</span>
                <span>জমা: {fmtDhakaDateTime(w.created_at)}</span>
                {w.reviewed_at && <span>রিভিউ: {fmtDhakaDateTime(w.reviewed_at)}</span>}
                {w.svp_checked_at && <span>SVP চেক: {fmtDhakaDateTime(w.svp_checked_at)}</span>}
              </div>
              {w.rejection_reason && <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">কারণ: {w.rejection_reason}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openTicket(w.ticket_path)}><FileText className="mr-1 h-4 w-4" /> Ticket</Button>
                {w.status !== "approved" && <Button size="sm" disabled={busyId === w.id} onClick={() => review(w, "approved")}><Check className="mr-1 h-4 w-4" /> Approve</Button>}
                {w.status !== "rejected" && <Button size="sm" variant="destructive" disabled={busyId === w.id} onClick={() => { setReason(""); setRejecting(w); }}><X className="mr-1 h-4 w-4" /> Reject</Button>}
                {w.status === "approved" && <Button size="sm" variant="secondary" disabled={busyId === w.id} onClick={() => svp(w)}><RefreshCw className="mr-1 h-4 w-4" /> SVP চেক</Button>}
              </div>
              <WorkNotes submissionId={w.id} canAdd={false} />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>বাতিলের কারণ</DialogTitle></DialogHeader>
          <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="যেমন: Payment বকেয়া আছে" />
          <Button variant="destructive" disabled={reason.trim().length < 3} onClick={async () => { if (rejecting) await review(rejecting, "rejected", reason.trim()); setRejecting(null); }}>বাতিল নিশ্চিত করুন</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
