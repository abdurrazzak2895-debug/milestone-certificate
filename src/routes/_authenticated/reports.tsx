import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/app/ui-bits";
import { ChartCard, SimpleBar } from "@/components/app/Charts";
import { candidatesQ, examsQ, occQ, ttcQ, lookup, bn, fmtDate, todayStr, RESULT_LABEL, exportCSV, exportXLSX } from "@/lib/data";
import { groupCount, passRateBy, monthly, repeatCounts } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "রিপোর্ট ও বিশ্লেষণ | Milestone Certificate Institute" }, { name: "description", content: "বিশ্লেষণ, চার্ট এবং CSV/Excel এক্সপোর্ট।" }, { property: "og:title", content: "রিপোর্ট ও বিশ্লেষণ | Milestone Certificate Institute" }, { property: "og:description", content: "বিশ্লেষণ, চার্ট এবং CSV/Excel এক্সপোর্ট।" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Reports,
});

function Reports() {
  const { data: cands = [] } = useQuery(candidatesQ);
  const { data: exams = [] } = useQuery(examsQ);
  const { data: occ } = useQuery(occQ);
  const { data: ttc } = useQuery(ttcQ);
  const occName = lookup(occ);
  const ttcName = lookup(ttc);
  const candMap = useMemo(() => new Map(cands.map((c) => [c.id, c])), [cands]);
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const t = todayStr();

  const { per, dist } = repeatCounts(exams);
  const repeatIds = [...per.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  const failedIds = [...new Set(exams.filter((e) => e.result === "FAIL").map((e) => e.candidate_id))];
  const waitingIds = [...new Set(exams.filter((e) => e.result === "PENDING" && e.exam_date < t).map((e) => e.candidate_id))];
  const upcomingIds = [...new Set(exams.filter((e) => e.result === "PENDING" && e.exam_date >= t).map((e) => e.candidate_id))];
  const topOcc = groupCount(exams, (e) => occName(e.occupation_id))[0];
  const topTtc = groupCount(cands, (c) => ttcName(c.ttc_id))[0];
  const occRate = passRateBy(exams, (e) => occName(e.occupation_id));
  const ttcRate = passRateBy(exams, (e) => ttcName(e.ttc_id));

  const examRow = (e: (typeof exams)[number]) => {
    const c = candMap.get(e.candidate_id);
    return { "নাম": c?.name, "পাসপোর্ট": c?.passport_no, "রেজিস্ট্রেশন": c?.registration_no, "মোবাইল": c?.mobile, "পেশা": occName(e.occupation_id), "টিটিসি": ttcName(e.ttc_id), "পরীক্ষার তারিখ": e.exam_date, "সময়": e.exam_time, "ধরন": e.exam_type, "রেজাল্ট": RESULT_LABEL[e.result], "রেজাল্টের তারিখ": e.result_date, "স্কোর": e.score, "মন্তব্য": e.remarks };
  };
  const reports: { label: string; name: string; rows: () => Record<string, unknown>[] }[] = [
    { label: "পরীক্ষার্থী তালিকা", name: "candidates", rows: () => cands.map((c) => ({ "নাম": c.name, "পাসপোর্ট": c.passport_no, "রেজিস্ট্রেশন": c.registration_no, "মোবাইল": c.mobile, "পেশা": occName(c.occupation_id), "টিটিসি": ttcName(c.ttc_id), "জেলা": c.district, "পাসপোর্ট মেয়াদ": c.passport_expiry, "জন্ম তারিখ": c.date_of_birth, "মোট পরীক্ষা": per.get(c.id) ?? 0, "নোট": c.notes })) },
    { label: "পরীক্ষার ইতিহাস", name: "exam-history", rows: () => exams.map(examRow) },
    { label: "রেজাল্ট তালিকা", name: "results", rows: () => exams.filter((e) => e.result !== "PENDING").map(examRow) },
    { label: "আসন্ন পরীক্ষা", name: "upcoming-exams", rows: () => exams.filter((e) => e.exam_date >= t && e.result === "PENDING").map(examRow) },
    { label: `মাসিক রিপোর্ট (${month})`, name: `monthly-${month}`, rows: () => exams.filter((e) => e.exam_date.startsWith(month)).map(examRow) },
    { label: "পেশা অনুযায়ী রিপোর্ট", name: "occupation-report", rows: () => occRate.map((r) => ({ "পেশা": r.name, "মোট পরীক্ষা": exams.filter((e) => occName(e.occupation_id) === r.name).length, "পাস": r.pass, "ফেল": r.fail, "পাসের হার %": r.rate })) },
    { label: "টিটিসি অনুযায়ী রিপোর্ট", name: "ttc-report", rows: () => ttcRate.map((r) => ({ "টিটিসি": r.name, "মোট পরীক্ষা": exams.filter((e) => ttcName(e.ttc_id) === r.name).length, "পাস": r.pass, "ফেল": r.fail, "পাসের হার %": r.rate })) },
  ];

  const insight = [
    ["সবচেয়ে বেশি পরীক্ষা (পেশা)", topOcc ? `${topOcc.name} (${bn(topOcc.value)})` : "—"],
    ["সবচেয়ে বেশি পরীক্ষার্থী (টিটিসি)", topTtc ? `${topTtc.name} (${bn(topTtc.value)})` : "—"],
    ["একাধিকবার পরীক্ষা দিয়েছেন", `${bn(repeatIds.length)} জন`],
    ["রেজাল্টের অপেক্ষায়", `${bn(waitingIds.length)} জন`],
    ["আসন্ন পরীক্ষা আছে", `${bn(upcomingIds.length)} জন`],
    ["আগে ফেল করেছেন", `${bn(failedIds.length)} জন`],
  ];

  return (
    <div>
      <PageHeader title="রিপোর্ট ও বিশ্লেষণ" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {insight.map(([k, v]) => <div key={k} className="card-surface p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="mt-1 font-semibold">{v}</div></div>)}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="পেশা অনুযায়ী পাসের হার (%)"><SimpleBar data={occRate} dataKey="rate" unit="%" /></ChartCard>
        <ChartCard title="টিটিসি অনুযায়ী পাসের হার (%)"><SimpleBar data={ttcRate} dataKey="rate" unit="%" color="var(--chart-4)" /></ChartCard>
        <ChartCard title="পরীক্ষার্থী প্রতি পরীক্ষার সংখ্যা"><SimpleBar data={dist} color="var(--chart-3)" /></ChartCard>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <RateTable title="পেশা অনুযায়ী" rows={occRate} />
        <RateTable title="টিটিসি অনুযায়ী" rows={ttcRate} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <NameList title="একাধিকবার পরীক্ষা" ids={repeatIds} names={(id) => `${candMap.get(id)?.name} (${bn(per.get(id) ?? 0)} বার)`} />
        <NameList title="আগে ফেল করেছেন" ids={failedIds} names={(id) => candMap.get(id)?.name ?? ""} />
        <NameList title="রেজাল্টের অপেক্ষায়" ids={waitingIds} names={(id) => candMap.get(id)?.name ?? ""} />
      </div>

      <div className="card-surface mt-5 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">এক্সপোর্ট</h3>
          <label className="flex items-center gap-2 text-sm">মাস: <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-md border bg-card px-2" /></label>
        </div>
        <ul className="divide-y">
          {reports.map((r) => (
            <li key={r.name} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="font-medium">{r.label}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportCSV(r.name, r.rows())}><FileText className="h-4 w-4" /> CSV</Button>
                <Button size="sm" variant="outline" onClick={() => exportXLSX(r.name, r.rows())}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">মাসিক রিপোর্ট: {fmtDate(month + "-01")} মাসের সব পরীক্ষা।</p>
      </div>
    </div>
  );
}

function RateTable({ title, rows }: { title: string; rows: { name: string; pass: number; fail: number; rate: number }[] }) {
  return (
    <div className="card-surface p-4">
      <h3 className="mb-2 text-base font-semibold">{title} পাসের হার</h3>
      {rows.length === 0 ? <Empty>তথ্য নেই</Empty> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">নাম</th><th>পাস</th><th>ফেল</th><th>হার</th></tr></thead>
          <tbody className="divide-y">{rows.map((r) => <tr key={r.name}><td className="py-2">{r.name}</td><td>{bn(r.pass)}</td><td>{bn(r.fail)}</td><td className="font-semibold text-primary">{bn(r.rate)}%</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

function NameList({ title, ids, names }: { title: string; ids: string[]; names: (id: string) => string }) {
  return (
    <div className="card-surface p-4">
      <h3 className="mb-2 text-base font-semibold">{title} ({bn(ids.length)})</h3>
      {ids.length === 0 ? <Empty>কেউ নেই</Empty> : <ul className="space-y-1 text-sm">{ids.map((id) => <li key={id}>• {names(id)}</li>)}</ul>}
    </div>
  );
}
