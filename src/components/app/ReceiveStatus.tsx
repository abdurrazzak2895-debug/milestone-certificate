import { DateSelect } from "@/components/app/DateSelect";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BarChart3, History, UserCheck, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setReceiveStatus } from "@/lib/workflow.functions";
import { worksQ, fmtDhakaDateTime, type Work } from "@/lib/works";
import { occQ, lookup, bn } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Live sync: any change to submissions refreshes every open ID. Mount once. */
export function useWorksRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("works-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_submissions" }, () => {
        qc.invalidateQueries({ queryKey: ["works"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "exams" }, () => {
        qc.invalidateQueries({ queryKey: ["exams"] });
        qc.invalidateQueries({ queryKey: ["works"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

export function ReceiveToggle({ w }: { w: Work }) {
  const qc = useQueryClient();
  const save = useServerFn(setReceiveStatus);
  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  if (w.status === "rejected") return null;
  const received = w.arrival_status === "received";
  const set = async (status: "received" | "not_arrived") => {
    setBusy(true);
    try {
      await save({ data: { id: w.id, status } });
      toast.success(status === "received" ? "রিসিভ হয়েছে" : "রিসিভ হয়নি");
      qc.invalidateQueries({ queryKey: ["works"] });
      qc.invalidateQueries({ queryKey: ["receive-log", w.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "পরিবর্তন করা যায়নি");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        variant={received ? "default" : "outline"}
        disabled={busy}
        onClick={() => set("received")}
      >
        <UserCheck className="h-4 w-4" /> রিসিভ হয়েছে
      </Button>
      <Button
        size="sm"
        variant={!received ? "destructive" : "outline"}
        disabled={busy}
        onClick={() => set("not_arrived")}
      >
        <UserX className="h-4 w-4" /> রিসিভ হয়নি
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="পরিবর্তনের রেকর্ড"
        onClick={() => setLogOpen(true)}
      >
        <History className="h-4 w-4" />
      </Button>
      {logOpen && <ReceiveLog id={w.id} open={logOpen} onOpenChange={setLogOpen} />}
    </div>
  );
}

function ReceiveLog({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data = [] } = useQuery({
    queryKey: ["receive-log", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receive_status_log")
        .select("*")
        .eq("submission_id", id)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>রিসিভ স্ট্যাটাসের রেকর্ড</DialogTitle>
        </DialogHeader>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">এখনো কোনো পরিবর্তন হয়নি</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.map((l) => (
              <li key={l.id} className="py-2">
                <b>
                  {l.new_status === "received"
                    ? "✓ রিসিভ হয়েছে"
                    : l.new_status === "absent"
                      ? "✗ অনুপস্থিত"
                      : "✗ রিসিভ হয়নি"}
                </b>{" "}
                — {l.changed_by_name ?? "—"}
                <div className="text-xs text-muted-foreground">
                  {fmtDhakaDateTime(l.changed_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

const dhakaDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 6 * 3600000).toISOString().slice(0, 10);

export function ReceiveAnalyticsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <BarChart3 className="h-4 w-4" /> রিসিভ বিশ্লেষণ
      </Button>
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>রিসিভ বিশ্লেষণ</DialogTitle>
            </DialogHeader>
            <ReceiveAnalytics />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function ReceiveAnalytics() {
  const { data: works = [] } = useQuery(worksQ);
  const { data: occ } = useQuery(occQ);
  const occName = lookup(occ);
  const { data: agents = [] } = useQuery({
    queryKey: ["receive-agents"],
    queryFn: async () => {
      const { data } = await supabase.from("agent_accounts").select("user_id,full_name,agent_code");
      return data ?? [];
    },
  });
  const agentName = (id: string) => {
    const a = agents.find((x) => x.user_id === id);
    return a ? `${a.full_name}${a.agent_code ? ` (${a.agent_code})` : ""}` : "নিজের/অন্যান্য";
  };
  const [agent, setAgent] = useState("");
  const [date, setDate] = useState("");
  const [oc, setOc] = useState("");
  const list = works.filter((w) => w.status !== "rejected");
  const agentIds = useMemo(() => [...new Set(list.map((w) => w.submitted_by))], [list]);
  const occIds = useMemo(
    () => [...new Set(list.map((w) => w.occupation_id).filter(Boolean) as string[])],
    [list],
  );
  const rows = list.filter(
    (w) =>
      (!agent || w.submitted_by === agent) &&
      (!date || dhakaDate(w.exam_at) === date) &&
      (!oc || w.occupation_id === oc),
  );
  const rec = rows.filter((w) => w.arrival_status === "received").length;
  const total = rows.length;
  const pct = total ? Math.round((rec / total) * 100) : 0;
  const byAgent = agentIds
    .map((id) => {
      const r = rows.filter((w) => w.submitted_by === id);
      const x = r.filter((w) => w.arrival_status === "received").length;
      return { id, total: r.length, rec: x };
    })
    .filter((a) => a.total > 0)
    .sort((a, b) => b.total - a.total);
  const sel = "h-9 rounded-md border bg-card px-2 text-sm";
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={sel} value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">সকল আইডি</option>
          {agentIds.map((id) => (
            <option key={id} value={id}>
              {agentName(id)}
            </option>
          ))}
        </select>
        <DateSelect className={sel} value={date} onChange={(e) => setDate(e.target.value)} />
        <select className={sel} value={oc} onChange={(e) => setOc(e.target.value)}>
          <option value="">সকল পেশা</option>
          {occIds.map((id) => (
            <option key={id} value={id}>
              {occName(id)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["মোট পরীক্ষার্থী", bn(total)],
          ["রিসিভ হয়েছে", bn(rec)],
          ["রিসিভ হয়নি", bn(total - rec)],
          ["রিসিভের হার", `${bn(pct)}%`],
        ].map(([k, v]) => (
          <div key={k} className="card-surface p-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="mt-1 text-xl font-bold">{v}</div>
          </div>
        ))}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {byAgent.length > 1 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1">আইডি</th>
              <th>মোট</th>
              <th>রিসিভ</th>
              <th>হার</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {byAgent.map((a) => (
              <tr key={a.id}>
                <td className="py-1.5">{agentName(a.id)}</td>
                <td>{bn(a.total)}</td>
                <td>{bn(a.rec)}</td>
                <td className="font-semibold text-primary">
                  {bn(Math.round((a.rec / a.total) * 100))}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Large, clear reception status shown above each candidate's details. */
export function ReceiveBanner({ w }: { w: Work }) {
  if (w.status === "rejected") return null;
  const ok = w.arrival_status === "received";
  return (
    <div
      className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-base font-bold ${ok ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive"}`}
    >
      {ok ? <UserCheck className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
      {ok ? "রিসিপশন রিসিভ হয়েছে" : "রিসিপশন রিসিভ হয়নি"}
      {ok && w.received_at && (
        <span className="ml-auto text-xs font-normal">{fmtDhakaDateTime(w.received_at)}</span>
      )}
    </div>
  );
}
