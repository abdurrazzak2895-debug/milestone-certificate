import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { occQ, ttcQ, lookup, todayStr } from "@/lib/data";

type Row = { id: string; ref_code: string; candidate_name: string; passport_no: string; mobile: string; exam_at: string; status: string; svp_result: string; arrival_status: string; created_at: string; reviewed_at: string | null; occupation_id: string | null; ttc_id: string | null };

const dhakaDate = (iso: string) => new Date(new Date(iso).getTime() + 6 * 3600e3).toISOString().slice(0, 10);

export function AdminActivity() {
  const [day, setDay] = useState(todayStr());
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [status, setStatus] = useState("all");
  const { data: occ } = useQuery(occQ);
  const { data: ttc } = useQuery(ttcQ);
  const occName = lookup(occ);
  const ttcName = lookup(ttc);
  const { data: rows = [] } = useQuery({
    queryKey: ["admin-activity-subs"],
    queryFn: async () => {
      const all: Row[] = [];
      for (let i = 0; ; i += 1000) {
        const { data, error } = await supabase.from("job_submissions").select("id,ref_code,candidate_name,passport_no,mobile,exam_at,status,svp_result,arrival_status,created_at,reviewed_at,occupation_id,ttc_id").order("exam_at").range(i, i + 999);
        if (error) throw error;
        all.push(...(data as Row[]));
        if (data.length < 1000) break;
      }
      return all;
    },
  });
  const { data: sms = 0 } = useQuery({
    queryKey: ["admin-activity-sms", day],
    queryFn: async () => {
      const s = new Date(`${day}T00:00:00+06:00`).toISOString();
      const e = new Date(new Date(s).getTime() + 86400e3).toISOString();
      const { count } = await supabase.from("sms_messages").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", s).lt("sent_at", e);
      return count ?? 0;
    },
  });
  const summary = useMemo(() => ({
    newSubs: rows.filter((r) => dhakaDate(r.created_at) === day).length,
    approved: rows.filter((r) => r.reviewed_at && r.status === "approved" && dhakaDate(r.reviewed_at) === day).length,
    pass: rows.filter((r) => r.svp_result === "PASS" && dhakaDate(r.exam_at) === day).length,
  }), [rows, day]);
  const filtered = rows.filter((r) => { const d = dhakaDate(r.exam_at); return d >= from && d <= to && (status === "all" || r.status === status); });

  const exportCsv = () => {
    const head = ["Ref", "Name", "Passport", "Mobile", "Exam Date/Time", "Occupation", "TTC", "Status", "Result", "Reception"];
    const lines = filtered.map((r) => [r.ref_code, r.candidate_name, r.passport_no, r.mobile, new Date(r.exam_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }), occName(r.occupation_id ?? ""), ttcName(r.ttc_id ?? ""), r.status, r.svp_result, r.arrival_status]);
    const csv = [head, ...lines].map((l) => l.map((v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; }).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `candidates_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const waLink = (r: Row) => {
    const t = ttc?.find((x) => x.id === r.ttc_id) as { name?: string; address?: string | null } | undefined;
    const msg = `প্রিয় ${r.candidate_name}, আপনার পরীক্ষা: ${new Date(r.exam_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}\nকেন্দ্র: ${t?.name ?? ""}${t?.address ? `\nঠিকানা: ${t.address}` : ""}\n— Milestone Certificate Institute`;
    const num = r.mobile.replace(/\D/g, "").replace(/^0/, "880");
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  };
  const waList = rows.filter((r) => r.status === "approved" && dhakaDate(r.exam_at) === day);

  return (
    <div className="mb-5 space-y-4 rounded-2xl border bg-card/90 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">অ্যাক্টিভিটি সামারি</h2>
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["নতুন সাবমিশন", summary.newSubs], ["অনুমোদিত", summary.approved], ["PASS (ঐ দিনের পরীক্ষা)", summary.pass], ["SMS পাঠানো", sms]].map(([l, v]) => (
          <div key={l} className="rounded-xl border bg-background p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-bold">{v}</div></div>
        ))}
      </div>

      <div className="rounded-xl border p-3">
        <div className="mb-2 text-sm font-semibold">পরীক্ষার্থী তালিকা Excel/CSV এক্সপোর্ট (পরীক্ষার তারিখ অনুযায়ী)</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <span>—</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="all">সব স্ট্যাটাস</option><option value="approved">অনুমোদিত</option><option value="pending_approval">অপেক্ষমান</option><option value="rejected">বাতিল</option>
          </select>
          <Button onClick={exportCsv} disabled={!filtered.length}><Download className="mr-1 h-4 w-4" />ডাউনলোড ({filtered.length})</Button>
        </div>
      </div>

      <div className="rounded-xl border p-3">
        <div className="mb-2 text-sm font-semibold">WhatsApp-এ পরীক্ষার সময় ও ঠিকানা পাঠান ({waList.length})</div>
        {waList.length === 0 ? <p className="text-sm text-muted-foreground">এই তারিখে কোনো অনুমোদিত পরীক্ষা নেই।</p> : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {waList.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-1.5 text-sm">
                <span className="truncate">{r.candidate_name} · {r.mobile}</span>
                <a href={waLink(r)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-success px-2 py-1 text-xs font-medium text-primary-foreground"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
