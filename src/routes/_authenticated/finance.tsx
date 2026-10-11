import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({
    meta: [
      { title: "গোপন আর্থিক হিসাব — শুধু অ্যাডমিন | Milestone Certificate Institute" },
      { name: "description", content: "এজেন্টভিত্তিক ফি, আদায়, বকেয়া ও আয়ের গোপন হিসাব, শুধু অ্যাডমিনের জন্য।" },
      { property: "og:title", content: "গোপন আর্থিক হিসাব — শুধু অ্যাডমিন | Milestone Certificate Institute" },
      { property: "og:description", content: "এজেন্টভিত্তিক ফি, আদায়, বকেয়া ও আয়ের গোপন হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Finance,
});

const tk = (n: number) => `৳ ${n.toLocaleString("bn-BD")}`;

function Finance() {
  const [sq, setSq] = useState("");
  const q = useQuery({
    queryKey: ["admin-finance"],
    queryFn: async () => {
      const [c, p, s, a] = await Promise.all([
        supabase.from("candidates").select("id,name,passport_no,mobile,fee_amount"),
        supabase.from("payments").select("candidate_id,amount,status"),
        supabase.from("job_submissions").select("candidate_id,submitted_by"),
        supabase.from("agent_accounts").select("user_id,full_name,agent_code,mobile,role"),
      ]);
      const err = c.error || p.error || s.error || a.error;
      if (err) throw err;
      return { c: c.data ?? [], p: p.data ?? [], s: s.data ?? [], a: a.data ?? [] };
    },
  });

  const view = useMemo(() => {
    if (!q.data) return null;
    const paid = new Map<string, number>();
    let pending = 0;
    for (const x of q.data.p) {
      if (x.status === "approved") paid.set(x.candidate_id, (paid.get(x.candidate_id) ?? 0) + Number(x.amount));
      else if (x.status === "pending") pending += Number(x.amount);
    }
    const agentOf = new Map(q.data.s.filter((x) => x.candidate_id).map((x) => [x.candidate_id as string, x.submitted_by]));
    const agents = new Map(q.data.a.map((x) => [x.user_id, x]));
    const rows = new Map<string, { name: string; code: string; count: number; fee: number; paid: number }>();
    let fee = 0, got = 0;
    for (const c of q.data.c) {
      const f = Number(c.fee_amount), g = paid.get(c.id) ?? 0;
      fee += f; got += g;
      const id = agentOf.get(c.id) ?? "none";
      const ag = agents.get(id);
      const r = rows.get(id) ?? { name: ag?.full_name ?? "সরাসরি / এজেন্ট ছাড়া", code: ag?.agent_code ?? "—", count: 0, fee: 0, paid: 0 };
      r.count++; r.fee += f; r.paid += g;
      rows.set(id, r);
    }
    return { fee, got, pending, due: Math.max(fee - got, 0), rows: [...rows.values()].sort((x, y) => y.fee - x.fee) };
  }, [q.data]);

  const list = (view?.rows ?? []).filter((r) => !sq || `${r.name} ${r.code}`.toLowerCase().includes(sq.toLowerCase()));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">গোপন আর্থিক হিসাব</h1>
        <p className="text-sm text-muted-foreground">এই পেজ শুধু অ্যাডমিন দেখতে পারেন।</p>
      </div>
      {q.isLoading && <p className="text-muted-foreground">লোড হচ্ছে...</p>}
      {q.error && <p className="text-destructive">তথ্য আনা যায়নি</p>}
      {view && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["মোট ফি", view.fee], ["আদায় হয়েছে", view.got], ["বকেয়া", view.due], ["যাচাই অপেক্ষমান", view.pending]].map(([l, v]) => (
              <div key={l as string} className="rounded-2xl border bg-card p-4">
                <div className="text-sm text-muted-foreground">{l}</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{tk(v as number)}</div>
              </div>
            ))}
          </div>
          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">এজেন্টভিত্তিক হিসাব</h2>
              <Input value={sq} onChange={(e) => setSq(e.target.value)} placeholder="নাম বা ID দিয়ে খুঁজুন" className="max-w-xs" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="p-2">এজেন্ট</th><th className="p-2">পরীক্ষার্থী</th><th className="p-2">মোট ফি</th><th className="p-2">আদায়</th><th className="p-2">বকেয়া</th></tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.name + r.code} className="border-t">
                      <td className="p-2">{r.name} <span className="text-muted-foreground">({r.code})</span></td>
                      <td className="p-2 tabular-nums">{r.count.toLocaleString("bn-BD")}</td>
                      <td className="p-2 tabular-nums">{tk(r.fee)}</td>
                      <td className="p-2 tabular-nums text-primary">{tk(r.paid)}</td>
                      <td className="p-2 tabular-nums text-destructive">{tk(Math.max(r.fee - r.paid, 0))}</td>
                    </tr>
                  ))}
                  {list.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">কোনো তথ্য নেই</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
