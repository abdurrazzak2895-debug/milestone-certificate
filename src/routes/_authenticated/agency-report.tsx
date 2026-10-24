import { DateSelect } from "@/components/app/DateSelect";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { worksQ, type Work } from "@/lib/works";

export const Route = createFileRoute("/_authenticated/agency-report")({
  head: () => ({
    meta: [
      { title: "এজেন্সি কাজের সারসংক্ষেপ | Milestone Certificate Institute" },
      {
        name: "description",
        content: "এজেন্সিভিত্তিক ও তারিখভিত্তিক কাজ, পাস/ফেল ও পেমেন্ট অবস্থার রিপোর্ট।",
      },
      {
        property: "og:title",
        content: "এজেন্সি কাজের সারসংক্ষেপ | Milestone Certificate Institute",
      },
      { property: "og:description", content: "এজেন্সিভিত্তিক কাজ, পাস/ফেল ও পেমেন্ট রিপোর্ট।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgencyReport,
});

const n = (x: number) => x.toLocaleString("bn-BD");
const tk = (x: number) => `৳ ${n(x)}`;
const dhakaDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

type Row = {
  id: string;
  name: string;
  code: string;
  total: number;
  pass: number;
  fail: number;
  pending: number;
  fee: number;
  paid: number;
  works: Work[];
};

function AgencyReport() {
  const works = useQuery(worksQ);
  const extra = useQuery({
    queryKey: ["agency-report-extra"],
    queryFn: async () => {
      const [a, c, p] = await Promise.all([
        supabase.from("agent_accounts").select("user_id,full_name,agent_code,parent_agent_id"),
        supabase.from("candidates").select("id,fee_amount"),
        supabase.from("payments").select("candidate_id,amount,status"),
      ]);
      const err = a.error || c.error || p.error;
      if (err) throw err;
      return { a: a.data ?? [], c: c.data ?? [], p: p.data ?? [] };
    },
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sq, setSq] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!works.data || !extra.data) return null;
    const agents = new Map(extra.data.a.map((x) => [x.user_id, x]));
    const fee = new Map(extra.data.c.map((x) => [x.id, Number(x.fee_amount)]));
    const paid = new Map<string, number>();
    for (const p of extra.data.p)
      if (p.status === "approved")
        paid.set(p.candidate_id, (paid.get(p.candidate_id) ?? 0) + Number(p.amount));
    const list = works.data
      .filter((w) => w.status !== "rejected")
      .filter((w) => {
        const d = dhakaDate(w.exam_at);
        return (!from || d >= from) && (!to || d <= to);
      });
    const rows = new Map<string, Row>();
    const days = new Map<
      string,
      { total: number; pass: number; fail: number; agents: Map<string, number> }
    >();
    for (const w of list) {
      // Sub-agent work is counted under the parent agency.
      const ag = agents.get(w.submitted_by);
      const id = ag?.parent_agent_id ?? w.submitted_by;
      const top = agents.get(id);
      const r = rows.get(id) ?? {
        id,
        name: top?.full_name ?? "অজানা",
        code: top?.agent_code ?? "—",
        total: 0,
        pass: 0,
        fail: 0,
        pending: 0,
        fee: 0,
        paid: 0,
        works: [],
      };
      r.total++;
      r.works.push(w);
      if (w.svp_result === "PASS") r.pass++;
      else if (w.svp_result === "FAIL") r.fail++;
      else r.pending++;
      if (w.candidate_id) {
        r.fee += fee.get(w.candidate_id) ?? 0;
        r.paid += paid.get(w.candidate_id) ?? 0;
      }
      rows.set(id, r);
      const d = dhakaDate(w.exam_at);
      const dv = days.get(d) ?? { total: 0, pass: 0, fail: 0, agents: new Map() };
      dv.total++;
      if (w.svp_result === "PASS") dv.pass++;
      if (w.svp_result === "FAIL") dv.fail++;
      dv.agents.set(r.name, (dv.agents.get(r.name) ?? 0) + 1);
      days.set(d, dv);
    }
    const all = [...rows.values()].sort((a, b) => b.total - a.total);
    const sum = all.reduce(
      (s, r) => ({
        total: s.total + r.total,
        pass: s.pass + r.pass,
        fail: s.fail + r.fail,
        pending: s.pending + r.pending,
        fee: s.fee + r.fee,
        paid: s.paid + r.paid,
      }),
      { total: 0, pass: 0, fail: 0, pending: 0, fee: 0, paid: 0 },
    );
    return { rows: all, sum, days: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])) };
  }, [works.data, extra.data, from, to]);

  const rows = (view?.rows ?? []).filter(
    (r) => !sq || `${r.name} ${r.code}`.toLowerCase().includes(sq.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">এজেন্সি কাজের সারসংক্ষেপ</h1>
        <p className="text-sm text-muted-foreground">
          পরীক্ষার তারিখ অনুযায়ী। সাব-এজেন্টের কাজ মূল এজেন্সির হিসাবে যুক্ত। বাতিল কাজ ধরা হয়নি।
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          থেকে
          <DateSelect value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          পর্যন্ত
          <DateSelect value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(from || to) && (
          <Button
            variant="outline"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            সব তারিখ
          </Button>
        )}
      </div>
      {(works.isLoading || extra.isLoading) && (
        <p className="text-muted-foreground">লোড হচ্ছে...</p>
      )}
      {(works.error || extra.error) && <p className="text-destructive">তথ্য আনা যায়নি</p>}
      {view && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["মোট কাজ", n(view.sum.total)],
                ["এজেন্সি", n(view.rows.length)],
                ["PASS", n(view.sum.pass)],
                ["FAIL", n(view.sum.fail)],
                ["আদায়", tk(view.sum.paid)],
                ["বকেয়া", tk(Math.max(view.sum.fee - view.sum.paid, 0))],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className="rounded-2xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{v}</div>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">এজেন্সিভিত্তিক হিসাব</h2>
              <Input
                value={sq}
                onChange={(e) => setSq(e.target.value)}
                placeholder="নাম বা ID দিয়ে খুঁজুন"
                className="max-w-xs"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">এজেন্সি</th>
                    <th className="p-2">কাজ</th>
                    <th className="p-2">PASS</th>
                    <th className="p-2">FAIL</th>
                    <th className="p-2">অপেক্ষমান</th>
                    <th className="p-2">পাসের হার</th>
                    <th className="p-2">পেমেন্ট</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const dec = r.pass + r.fail;
                    const due = Math.max(r.fee - r.paid, 0);
                    return (
                      <Fragment key={r.id}>
                        <tr key={r.id} className="border-t">
                          <td className="p-2">
                            {r.name} <span className="text-muted-foreground">({r.code})</span>
                          </td>
                          <td className="p-2 tabular-nums font-semibold">{n(r.total)}</td>
                          <td className="p-2 tabular-nums text-primary">{n(r.pass)}</td>
                          <td className="p-2 tabular-nums text-destructive">{n(r.fail)}</td>
                          <td className="p-2 tabular-nums">{n(r.pending)}</td>
                          <td className="p-2 tabular-nums">
                            {dec ? `${n(Math.round((r.pass / dec) * 100))}%` : "—"}
                          </td>
                          <td className="p-2 text-xs">
                            {r.fee === 0 ? (
                              <span className="text-muted-foreground">ফি নেই</span>
                            ) : due === 0 ? (
                              <span className="text-primary">পরিশোধিত</span>
                            ) : (
                              <span className="text-destructive">বকেয়া {tk(due)}</span>
                            )}
                            {r.fee > 0 && (
                              <div className="text-muted-foreground">
                                আদায় {tk(r.paid)} / {tk(r.fee)}
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setOpen(open === r.id ? null : r.id)}
                            >
                              {open === r.id ? "বন্ধ" : "বিস্তারিত"}
                            </Button>
                          </td>
                        </tr>
                        {open === r.id && (
                          <tr key={r.id + "-d"} className="bg-muted/40">
                            <td colSpan={8} className="p-2">
                              <table className="w-full text-xs">
                                <thead className="text-left text-muted-foreground">
                                  <tr>
                                    <th className="p-1">তারিখ</th>
                                    <th className="p-1">নাম</th>
                                    <th className="p-1">পাসপোর্ট</th>
                                    <th className="p-1">রেফ</th>
                                    <th className="p-1">রেজাল্ট</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.works.map((w) => (
                                    <tr key={w.id} className="border-t">
                                      <td className="p-1">{dhakaDate(w.exam_at)}</td>
                                      <td className="p-1">{w.candidate_name}</td>
                                      <td className="p-1">{w.passport_no}</td>
                                      <td className="p-1">{w.ref_code}</td>
                                      <td
                                        className={`p-1 font-semibold ${w.svp_result === "PASS" ? "text-primary" : w.svp_result === "FAIL" ? "text-destructive" : ""}`}
                                      >
                                        {w.svp_result}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-muted-foreground">
                        কোনো তথ্য নেই
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <h2 className="font-semibold">তারিখভিত্তিক হিসাব</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">তারিখ</th>
                    <th className="p-2">কাজ</th>
                    <th className="p-2">এজেন্সি</th>
                    <th className="p-2">PASS</th>
                    <th className="p-2">FAIL</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {view.days.map(([d, v]) => (
                    <Fragment key={d}>
                      <tr key={d} className="border-t">
                        <td className="p-2">{d}</td>
                        <td className="p-2 font-semibold tabular-nums">{n(v.total)}</td>
                        <td className="p-2 tabular-nums">{n(v.agents.size)}</td>
                        <td className="p-2 tabular-nums text-primary">{n(v.pass)}</td>
                        <td className="p-2 tabular-nums text-destructive">{n(v.fail)}</td>
                        <td className="p-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDay(day === d ? null : d)}
                          >
                            {day === d ? "বন্ধ" : "বিস্তারিত"}
                          </Button>
                        </td>
                      </tr>
                      {day === d && (
                        <tr key={d + "-d"} className="bg-muted/40">
                          <td colSpan={6} className="p-2 text-xs">
                            {[...v.agents.entries()]
                              .sort((a, b) => b[1] - a[1])
                              .map(([name, c]) => (
                                <span
                                  key={name}
                                  className="mr-2 inline-block rounded-full border bg-card px-2 py-0.5"
                                >
                                  {name}: {n(c)}
                                </span>
                              ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
