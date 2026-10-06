import { AgentDashboard } from "@/components/app/AgentDashboard";
import { isManager } from "@/lib/roles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Bell, CalendarClock, CalendarDays, CheckCircle2, ClipboardList, Clock, Plus, Search, Users, XCircle, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard, PageHeader, ResultBadge, Empty } from "@/components/app/ui-bits";
import { CandidateDialog, ExamDialog } from "@/components/app/forms";
import { ChartCard, SimpleBar, SimpleLine, SimplePie } from "@/components/app/Charts";
import { candidatesQ, examsQ, occQ, ttcQ, remindersQ, lookup, bn, fmtDate, fmtTime, todayStr, addDays, dayLabel, RESULT_LABEL } from "@/lib/data";
import { RANGE_LABEL, rangeBounds, inRange, stats, groupCount, monthly, byDate, type RangeKey } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "ড্যাশবোর্ড — পরীক্ষা ব্যবস্থাপনা" }, { name: "description", content: "পরিসংখ্যান, রিমাইন্ডার ও আসন্ন পরীক্ষা।" }, { property: "og:title", content: "ড্যাশবোর্ড" }, { property: "og:description", content: "পরিসংখ্যান, রিমাইন্ডার ও আসন্ন পরীক্ষা।" }] }),
  component: DashboardSwitch,
});

function DashboardSwitch() {
  const { roles } = Route.useRouteContext();
  return isManager(roles) ? <Dashboard /> : <AgentDashboard />;
}

function Dashboard() {
  const { data: cands = [] } = useQuery(candidatesQ);
  const { data: exams = [] } = useQuery(examsQ);
  const { data: occ } = useQuery(occQ);
  const { data: ttc } = useQuery(ttcQ);
  const { data: reminders = [] } = useQuery(remindersQ);
  const [range, setRange] = useState<RangeKey>("all");
  const [from, setFrom] = useState(addDays(todayStr(), -30));
  const [to, setTo] = useState(todayStr());
  const [candOpen, setCandOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);

  const occName = lookup(occ);
  const ttcName = lookup(ttc);
  const candMap = useMemo(() => new Map(cands.map((c) => [c.id, c])), [cands]);
  const filtered = useMemo(() => inRange(exams, rangeBounds(range, from, to)), [exams, range, from, to]);
  const s = stats(filtered, cands);
  const t = todayStr();
  const tomorrow = addDays(t, 1);
  const soon = exams.filter((e) => e.exam_date >= t && e.exam_date <= addDays(t, 7) && e.result === "PENDING").sort((a, b) => (a.exam_date + a.exam_time).localeCompare(b.exam_date + b.exam_time));
  const pendingResults = exams.filter((e) => e.result === "PENDING" && e.exam_date < t);

  const alerts = [
    ...exams.filter((e) => e.exam_date === t && e.result === "PENDING").map((e) => ({ tone: "danger", text: `আজ পরীক্ষা: ${candMap.get(e.candidate_id)?.name}`, id: e.candidate_id })),
    ...exams.filter((e) => e.exam_date === tomorrow && e.result === "PENDING").map((e) => ({ tone: "warning", text: `আগামীকাল পরীক্ষা: ${candMap.get(e.candidate_id)?.name}`, id: e.candidate_id })),
    ...pendingResults.map((e) => ({ tone: "info", text: `রেজাল্ট অপেক্ষমান: ${candMap.get(e.candidate_id)?.name} (${fmtDate(e.exam_date)})`, id: e.candidate_id })),
    ...cands.filter((c) => c.needs_follow_up).map((c) => ({ tone: "muted", text: `ফলো-আপ প্রয়োজন: ${c.name}`, id: c.id })),
    ...reminders.filter((r) => !r.done && r.due_date <= addDays(t, 1)).map((r) => ({ tone: "warning", text: `${r.title} — ${candMap.get(r.candidate_id ?? "")?.name ?? ""}`, id: r.candidate_id ?? "" })),
  ];
  const toneCls: Record<string, string> = { danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", info: "bg-info-soft text-info", muted: "bg-muted text-muted-foreground" };

  const passFail = [{ name: RESULT_LABEL.PASS, value: s.pass }, { name: RESULT_LABEL.FAIL, value: s.fail }, { name: RESULT_LABEL.ABSENT, value: s.absent }].filter((x) => x.value);

  return (
    <div>
      <PageHeader title="ড্যাশবোর্ড" subtitle={`আজ ${fmtDate(t)}`} />

      <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <QuickBtn icon={<Plus />} label="নতুন পরীক্ষার্থী" onClick={() => setCandOpen(true)} />
        <QuickBtn icon={<CalendarDays />} label="নতুন পরীক্ষা" onClick={() => setExamOpen(true)} />
        <QuickBtn icon={<ClipboardList />} label="রেজাল্ট যোগ করুন" to="/results" />
        <QuickBtn icon={<Search />} label="রেজাল্ট চেক" to="/results" />
        <QuickBtn icon={<BarChart3 />} label="রিপোর্ট" to="/reports" />
        <QuickBtn icon={<CalendarClock />} label="পরীক্ষার তালিকা" to="/exams" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
          <Button key={k} size="sm" variant={range === k ? "default" : "outline"} onClick={() => setRange(k)}>{RANGE_LABEL[k]}</Button>
        ))}
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
            <span>—</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="মোট পরীক্ষার্থী" value={bn(s.candidates)} icon={<Users className="h-5 w-5" />} />
        <StatCard label="মোট পরীক্ষা" value={bn(s.exams)} icon={<ClipboardList className="h-5 w-5" />} tone="info" />
        <StatCard label="রেজাল্ট অপেক্ষমান" value={bn(s.pending)} icon={<Clock className="h-5 w-5" />} tone="warning" />
        <StatCard label="আসন্ন পরীক্ষা" value={bn(s.upcoming)} icon={<CalendarClock className="h-5 w-5" />} tone="primary" />
        <StatCard label="পাস" value={bn(s.pass)} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
        <StatCard label="ফেল" value={bn(s.fail)} icon={<XCircle className="h-5 w-5" />} tone="danger" />
        <StatCard label="অনুপস্থিত" value={bn(s.absent)} icon={<UserX className="h-5 w-5" />} tone="muted" />
        <StatCard label="পাসের হার" value={`${bn(s.pass + s.fail ? Math.round((s.pass / (s.pass + s.fail)) * 100) : 0)}%`} icon={<BarChart3 className="h-5 w-5" />} tone="success" />
      </div>

      <BoguraSummary exams={exams} ttc={ttc ?? []} occName={occName} />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold"><Bell className="h-4 w-4 text-primary" /> রিমাইন্ডার</h3>
          {alerts.length === 0 ? <Empty>কোনো রিমাইন্ডার নেই</Empty> : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Link to="/candidates/$id" params={{ id: a.id }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${toneCls[a.tone]}`}>
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {a.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> আগামী ৭ দিনের পরীক্ষা</h3>
          {soon.length === 0 ? <Empty>কোনো আসন্ন পরীক্ষা নেই</Empty> : (
            <ul className="max-h-72 divide-y overflow-y-auto">
              {soon.map((e) => {
                const dl = dayLabel(e.exam_date);
                return (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <Link to="/candidates/$id" params={{ id: e.candidate_id }} className="font-medium hover:text-primary">{candMap.get(e.candidate_id)?.name}</Link>
                      <div className="text-xs text-muted-foreground">{occName(e.occupation_id)} · {ttcName(e.ttc_id)}</div>
                    </div>
                    <div className="text-right text-sm">
                      {dl ? <span className="inline-flex items-center gap-1 font-semibold text-danger"><span className="pulse-dot h-2 w-2 rounded-full bg-danger" />{dl}</span> : fmtDate(e.exam_date)}
                      <div className="text-xs text-muted-foreground">{fmtTime(e.exam_time)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="তারিখ অনুযায়ী পরীক্ষা"><SimpleBar data={byDate(filtered).map((d) => ({ ...d, name: fmtDate(d.name) }))} /></ChartCard>
        <ChartCard title="পাস বনাম ফেল">{passFail.length ? <SimplePie data={passFail} /> : <Empty>তথ্য নেই</Empty>}</ChartCard>
        <ChartCard title="পেশা অনুযায়ী পরীক্ষা"><SimpleBar data={groupCount(filtered, (e) => occName(e.occupation_id))} color="var(--chart-4)" /></ChartCard>
        <ChartCard title="টিটিসি অনুযায়ী পরীক্ষা"><SimpleBar data={groupCount(filtered, (e) => ttcName(e.ttc_id))} color="var(--chart-3)" /></ChartCard>
        <ChartCard title="মাসিক পরীক্ষা সংখ্যা"><SimpleLine data={monthly(filtered)} dataKey="count" /></ChartCard>
        <ChartCard title="মাসিক পাসের হার (%)"><SimpleLine data={monthly(filtered)} dataKey="rate" unit="%" /></ChartCard>
      </div>

      {pendingResults.length > 0 && (
        <div className="card-surface mt-5 p-4">
          <h3 className="mb-2 text-base font-semibold">রেজাল্টের অপেক্ষায়</h3>
          <div className="flex flex-wrap gap-2">
            {pendingResults.map((e) => (
              <Link key={e.id} to="/candidates/$id" params={{ id: e.candidate_id }} className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:bg-muted">
                {candMap.get(e.candidate_id)?.name} <ResultBadge result={e.result} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <CandidateDialog open={candOpen} onOpenChange={setCandOpen} />
      <ExamDialog open={examOpen} onOpenChange={setExamOpen} />
    </div>
  );
}

function QuickBtn({ icon, label, onClick, to }: { icon: React.ReactNode; label: string; onClick?: () => void; to?: "/results" | "/reports" | "/exams" }) {
  const cls = "card-surface flex flex-col items-center justify-center gap-1.5 p-3 text-center text-xs font-medium transition-colors hover:bg-primary-soft hover:text-primary [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-primary";
  return to ? <Link to={to} className={cls}>{icon}{label}</Link> : <button onClick={onClick} className={cls}>{icon}{label}</button>;
}
