import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, ResultBadge, Empty, Field } from "@/components/app/ui-bits";
import { ResultDialog } from "@/components/app/forms";
import { candidatesQ, examsQ, occQ, ttcQ, settingsQ, lookup, fmtDate, todayStr, RESULT_LABEL, useRefreshAll, type Exam } from "@/lib/data";
import { checkOfficialResult } from "@/lib/result-checker";

export const Route = createFileRoute("/_authenticated/results")({
  head: () => ({ meta: [{ title: "রেজাল্ট ব্যবস্থাপনা" }, { name: "description", content: "রেজাল্ট চেক ও আপডেট করুন।" }, { property: "og:title", content: "রেজাল্ট ব্যবস্থাপনা" }, { property: "og:description", content: "রেজাল্ট চেক ও আপডেট করুন।" }] }),
  component: ResultsPage,
});

function ResultsPage() {
  const { data: cands = [] } = useQuery(candidatesQ);
  const { data: exams = [] } = useQuery(examsQ);
  const { data: occ } = useQuery(occQ);
  const { data: ttc } = useQuery(ttcQ);
  const { data: settings } = useQuery(settingsQ);
  const refresh = useRefreshAll();
  const occName = lookup(occ);
  const ttcName = lookup(ttc);
  const candMap = useMemo(() => new Map(cands.map((c) => [c.id, c])), [cands]);
  const [reg, setReg] = useState("");
  const [pp, setPp] = useState("");
  const [examNo, setExamNo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resExam, setResExam] = useState<Exam | null>(null);

  const t = todayStr();
  const pending = exams.filter((e) => e.result === "PENDING" && e.exam_date <= t).sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  const match = cands.find((c) => (reg && c.registration_no === reg.trim()) || (pp && c.passport_no === pp.trim()));
  const matchExam = match ? exams.find((e) => e.candidate_id === match.id && e.result === "PENDING") : undefined;

  const check = async () => {
    if (!reg.trim()) return toast.error("রেজিস্ট্রেশন নম্বর দিন");
    setBusy(true);
    setMsg(null);
    const res = await checkOfficialResult({ registrationNo: reg.trim(), passportNo: pp.trim(), examNo: examNo.trim() }, settings?.result_api_url);
    setBusy(false);
    if (res.status !== "found") return setMsg(res.message);
    if (!match || !matchExam) return setMsg("রেজাল্ট পাওয়া গেছে কিন্তু মিল থাকা অপেক্ষমান পরীক্ষা নেই");
    if (matchExam.result === res.result) return toast.info("এই রেজাল্ট আগেই সংরক্ষিত আছে");
    const { error } = await supabase.from("exams").update({ result: res.result, score: res.score ?? null, result_date: res.resultDate }).eq("id", matchExam.id);
    if (error) return toast.error(error.message);
    toast.success(`রেজাল্ট সংরক্ষিত: ${RESULT_LABEL[res.result]}`);
    refresh();
  };

  return (
    <div>
      <PageHeader title="রেজাল্ট" subtitle="অটোমেটিক রেজাল্ট চেক ও ম্যানুয়াল এন্ট্রি" />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card-surface space-y-3 p-4 lg:col-span-2">
          <h3 className="text-base font-semibold">অটোমেটিক রেজাল্ট চেক</h3>
          <Field label="রেজিস্ট্রেশন নম্বর *"><Input value={reg} onChange={(e) => setReg(e.target.value)} placeholder="REG-2026-001" /></Field>
          <Field label="পাসপোর্ট নম্বর (প্রয়োজনে)"><Input value={pp} onChange={(e) => setPp(e.target.value)} /></Field>
          <Field label="পরীক্ষা/আবেদন নম্বর"><Input value={examNo} onChange={(e) => setExamNo(e.target.value)} /></Field>
          <Button className="w-full" onClick={check} disabled={busy}><Search className="h-4 w-4" /> {busy ? "চেক হচ্ছে..." : "রেজাল্ট চেক করুন"}</Button>
          {msg && (
            <div className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
              <div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" />{msg}</div>
              <p className="mt-1 text-foreground/80">নিচে থেকে ম্যানুয়ালি রেজাল্ট দিন।</p>
            </div>
          )}
          {match && (
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-semibold">{match.name}</div>
              <div className="text-muted-foreground">{match.passport_no} · {occName(match.occupation_id)}</div>
              {matchExam ? (
                <div className="mt-2 flex items-center justify-between">
                  <span>পরীক্ষা: {fmtDate(matchExam.exam_date)}</span>
                  <Button size="sm" onClick={() => setResExam(matchExam)}>ম্যানুয়াল রেজাল্ট দিন</Button>
                </div>
              ) : <div className="mt-2 text-muted-foreground">কোনো অপেক্ষমান পরীক্ষা নেই</div>}
            </div>
          )}
        </div>

        <div className="card-surface p-4 lg:col-span-3">
          <h3 className="mb-3 text-base font-semibold">রেজাল্টের অপেক্ষায় ({pending.length})</h3>
          {pending.length === 0 ? <Empty>সব রেজাল্ট আপডেট করা আছে</Empty> : (
            <ul className="divide-y">
              {pending.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link to="/candidates/$id" params={{ id: e.candidate_id }} className="font-medium hover:text-primary">{candMap.get(e.candidate_id)?.name}</Link>
                    <div className="text-xs text-muted-foreground">{fmtDate(e.exam_date)} · {occName(e.occupation_id)} · {ttcName(e.ttc_id)}</div>
                  </div>
                  <div className="flex items-center gap-2"><ResultBadge result={e.result} /><Button size="sm" onClick={() => setResExam(e)}>রেজাল্ট দিন</Button></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <ResultDialog open={!!resExam} onOpenChange={(o) => !o && setResExam(null)} exam={resExam} />
    </div>
  );
}
