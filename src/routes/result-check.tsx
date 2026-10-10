import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pinOcc } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/app/ui-bits";
import { RESULT_LABEL, fmtDate, type ExamResult } from "@/lib/data";
import { homeForRoles } from "@/lib/roles";

export const Route = createFileRoute("/result-check")({
  head: () => ({
    meta: [
      { title: "রেজাল্ট চেক — পাসপোর্ট ও পেশা দিয়ে | Milestone Certificate" },
      { name: "description", content: "পাসপোর্ট নম্বর ও পেশা দিয়ে আপনার পরীক্ষার রেজাল্ট দেখুন।" },
      { property: "og:title", content: "রেজাল্ট চেক | Milestone Certificate" },
      { property: "og:description", content: "পাসপোর্ট নম্বর ও পেশা দিয়ে পরীক্ষার রেজাল্ট দেখুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResultCheck,
});

type Res =
  | { status: "not_found" }
  | { status: "pending"; result_check_at: string | null }
  | { status: "available"; name: string; passport_no: string; occupation: string | null; ttc: string | null; exam_date: string | null; result: ExamResult };

function ResultCheck() {
  const { data: occ = [] } = useQuery({
    queryKey: ["public-occ"],
    queryFn: async () => pinOcc((await supabase.from("occupations").select("id,name").eq("active", true).order("name")).data ?? []),
  });
  const { data: home = "/auth" } = useQuery({
    queryKey: ["result-check-home"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const u = s.session?.user;
      if (!u) return "/auth" as const;
      const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", u.id);
      return homeForRoles((rows ?? []).map((r) => r.role as string));
    },
  });
  const [pp, setPp] = useState("");
  const [oc, setOc] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (oc || !occ.length) return;
    const d = occ.find((o) => o.name.toLowerCase() === "load and unload worker");
    if (d) setOc(d.id);
  }, [occ, oc]);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setRes(null);
    if (!pp.trim() || !oc) return setErr("পাসপোর্ট নম্বর ও পেশা দিন");
    setBusy(true);
    const { data, error } = await supabase.rpc("check_applicant_result", { _passport: pp.trim(), _occupation_id: oc });
    setBusy(false);
    if (error) return setErr("চেক করা যায়নি, পরে চেষ্টা করুন");
    setRes(data as unknown as Res);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            ← ফিরে যান
          </Button>
          <Link to={home}>
            <Button variant="outline" size="sm">🏠 হোম</Button>
          </Link>
        </div>

        <h1 className="text-center text-2xl font-bold text-primary">রেজাল্ট চেক</h1>
        <form onSubmit={check} className="card-surface space-y-3 p-5">
          <Field label="পাসপোর্ট নম্বর *"><Input value={pp} onChange={(e) => setPp(e.target.value)} /></Field>
          <Field label="পেশা *">
            <NativeSelect value={oc} onChange={(e) => setOc(e.target.value)}>
              <option value="">— নির্বাচন করুন —</option>
              {occ.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </Field>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "চেক হচ্ছে..." : "রেজাল্ট দেখুন"}</Button>
        </form>

        {res?.status === "not_found" && <div className="card-surface p-5 text-center">কোনো তথ্য পাওয়া যায়নি।</div>}
        {res?.status === "pending" && (
          <div className="card-surface p-5 text-center">
            <p className="font-semibold">রেজাল্ট এখনো প্রকাশ হয়নি।</p>
            <p className="mt-1 text-sm text-muted-foreground">আপনার রেজাল্ট এখনো প্রকাশ হয়নি। নির্ধারিত সময়ে পুনরায় চেক করুন।</p>
          </div>
        )}
        {res?.status === "available" && (
          <div className="card-surface space-y-2 p-5 text-sm">
            <Row k="নাম" v={res.name} />
            <Row k="পাসপোর্ট নম্বর" v={res.passport_no} />
            <Row k="পেশা" v={res.occupation} />
            <Row k="টিটিসি" v={res.ttc} />
            <Row k="পরীক্ষার তারিখ" v={fmtDate(res.exam_date)} />
            <Row k="রেজাল্ট" v={RESULT_LABEL[res.result] ?? res.result} />
            <Row k="অবস্থা" v="রেজাল্ট প্রকাশিত" />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return <div className="flex justify-between gap-3 border-b pb-2 last:border-0"><span className="text-muted-foreground">{k}</span><b>{v ?? "—"}</b></div>;
}
