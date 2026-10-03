import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalAssistant } from "@/components/app/PortalAssistant";
import { RESULT_LABEL, bn, fmtDate, type Candidate, type Exam } from "@/lib/data";

type PortalData = {
  candidate: Candidate | null;
  exams: Exam[];
  occ: Record<string, string>;
  ttc: Record<string, string>;
};

const portalQ = queryOptions({
  queryKey: ["portal"],
  queryFn: async (): Promise<PortalData> => {
    const [c, e, o, t] = await Promise.all([
      supabase.from("candidates").select("*").limit(1).maybeSingle(),
      supabase.from("exams").select("*").order("exam_date", { ascending: false }),
      supabase.from("occupations").select("id,name"),
      supabase.from("ttc_centers").select("id,name"),
    ]);
    const map = (rows: { id: string; name: string }[] | null) =>
      Object.fromEntries((rows ?? []).map((r) => [r.id, r.name]));
    return { candidate: c.data ?? null, exams: e.data ?? [], occ: map(o.data), ttc: map(t.data) };
  },
});

export const Route = createFileRoute("/portal")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "আমার ফলাফল ও সার্টিফিকেট" },
      { name: "description", content: "আপনার পরীক্ষার ফলাফল দেখুন এবং সার্টিফিকেট প্রিন্ট করুন।" },
      { property: "og:title", content: "আমার ফলাফল ও সার্টিফিকেট" },
      { property: "og:description", content: "পরীক্ষার্থীদের ব্যক্তিগত ফলাফল ও সার্টিফিকেট পোর্টাল।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(portalQ),
  component: PortalPage,
});

const badge: Record<string, string> = {
  PASS: "bg-primary/15 text-primary",
  FAIL: "bg-destructive/15 text-destructive",
  PENDING: "bg-muted text-muted-foreground",
  ABSENT: "bg-secondary text-secondary-foreground",
  CANCELLED: "bg-secondary text-secondary-foreground",
};

function PortalPage() {
  const { data } = useSuspenseQuery(portalQ);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [cert, setCert] = useState<Exam | null>(null);
  const c = data.candidate;

  const logout = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-primary">আমার পোর্টাল</h1>
          <button onClick={logout} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
            লগআউট
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 print:hidden">
        {!c ? (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <p className="font-semibold">আপনার মোবাইল নম্বরের সাথে কোনো পরীক্ষার্থীর তথ্য পাওয়া যায়নি।</p>
            <p className="mt-2 text-sm text-muted-foreground">অনুগ্রহ করে অফিসে যোগাযোগ করুন।</p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="text-xl font-bold">{c.name}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Info k="পাসপোর্ট নং" v={c.passport_no} />
                <Info k="ট্রেড" v={c.occupation_id ? data.occ[c.occupation_id] : null} />
                <Info k="টিটিসি" v={c.ttc_id ? data.ttc[c.ttc_id] : null} />
              </dl>
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold">পরীক্ষার ফলাফল</h2>
              {!(c.result_check_at && new Date(c.result_check_at) <= new Date()) ? (
                <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">আপনার রেজাল্ট এখনো প্রকাশ হয়নি। নির্ধারিত সময়ে পুনরায় চেক করুন।</p>
              ) : data.exams.length === 0 && (
                <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">এখনো কোনো পরীক্ষা নেই।</p>
              )}
              {c.result_check_at && new Date(c.result_check_at) <= new Date() && data.exams.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                  <div>
                    <p className="font-medium">{e.occupation_id ? data.occ[e.occupation_id] : e.exam_type}</p>
                    <p className="text-sm text-muted-foreground">
                      {fmtDate(e.exam_date)}
                      {e.score != null && ` · নম্বর ${bn(e.score)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge[e.result]}`}>
                      {RESULT_LABEL[e.result]}
                    </span>
                    {e.result === "PASS" && (
                      <button
                        onClick={() => setCert(e)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      >
                        সার্টিফিকেট
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>

            <a
              href="https://svp-international.pacc.sa/applicant-result"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border bg-card p-4 text-center font-semibold text-primary hover:bg-muted"
            >
              অফিসিয়াল SVP রেজাল্ট যাচাই করুন ↗
            </a>

            <PortalAssistant />
          </>
        )}
      </main>

      {cert && c && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-foreground/50 p-4 print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-2xl">
            <div className="rounded-2xl border-8 border-double border-primary bg-card p-8 text-center sm:p-12 print:rounded-none">
              <p className="text-sm tracking-widest text-muted-foreground">সার্টিফিকেট</p>
              <h2 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">দক্ষতা সনদপত্র</h2>
              <p className="mt-6 text-sm text-muted-foreground">এই মর্মে প্রত্যয়ন করা যাচ্ছে যে</p>
              <p className="mt-2 text-2xl font-bold">{c.name}</p>
              <p className="mt-4 text-sm leading-relaxed">
                {cert.occupation_id ? data.occ[cert.occupation_id] : cert.exam_type} ট্রেডে{" "}
                {fmtDate(cert.exam_date)} তারিখে অনুষ্ঠিত পরীক্ষায় সফলভাবে উত্তীর্ণ হয়েছেন।
              </p>
              <div className="mt-8 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <p>রেজিস্ট্রেশন: {c.registration_no ?? "—"}</p>
                <p>ফল প্রকাশ: {fmtDate(cert.result_date ?? cert.exam_date)}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-center gap-3 print:hidden">
              <button onClick={() => window.print()} className="rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground">
                প্রিন্ট / ডাউনলোড
              </button>
              <button onClick={() => setCert(null)} className="rounded-lg border bg-card px-5 py-2">
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v || "—"}</dd>
    </div>
  );
}
