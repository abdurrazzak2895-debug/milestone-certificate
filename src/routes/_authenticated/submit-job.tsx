import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ttcQ, dhakaInputToISO, bn } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/submit-job")({
  head: () => ({
    meta: [
      { title: "কাজ Submit করুন — এজেন্ট" },
      { name: "description", content: "এজেন্টদের জন্য পরীক্ষার্থীর কাজ Submit করার ফর্ম।" },
      { property: "og:title", content: "কাজ Submit করুন — এজেন্ট" },
      { property: "og:description", content: "এজেন্টদের জন্য পরীক্ষার্থীর কাজ Submit করার ফর্ম।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubmitJob,
});

const schema = z.object({
  passport_no: z.string().trim().min(5, "সঠিক পাসপোর্ট নম্বর দিন").max(20).regex(/^[A-Za-z0-9]+$/, "সঠিক পাসপোর্ট নম্বর দিন"),
  candidate_name: z.string().trim().min(2, "প্রার্থীর নাম দিন").max(100),
  mobile: z.string().trim().regex(/^01[3-9]\d{8}$/, "১১ সংখ্যার সঠিক মোবাইল নম্বর দিন"),
  ttc_id: z.string().uuid("TTC নির্বাচন করুন"),
  exam_at: z.string().min(1, "পরীক্ষার তারিখ ও সময় দিন"),
  education: z.enum(["educated", "uneducated"], { message: "শিক্ষাগত যোগ্যতা নির্বাচন করুন" }),
  experience: z.enum(["yes", "no"], { message: "কাজের অভিজ্ঞতা নির্বাচন করুন" }),
});

const notices = [
  ["🕙", "পরীক্ষার আগের দিন সকাল ১০:০০টার মধ্যে প্রার্থীকে আমাদের নির্ধারিত লোকেশনে উপস্থিত হতে হবে।"],
  ["💰", "কোনো Payment বকেয়া থাকলে কাজ Approve করা হবে না।"],
  ["🚫", "কাজ একবার Submit করার পর Cancel করা যাবে না।"],
  ["❌", "একান্তই Cancel করতে হলে পরীক্ষার কমপক্ষে ৩ দিন আগে আমাদের জানাতে হবে।"],
  ["📄", "Takamul Appointment Ticket-এর PDF/Photo Upload না করলে কাজ Submit করা যাবে না।"],
  ["✅", "Submit করার আগে সকল তথ্য সঠিকভাবে যাচাই করে নিতে হবে।"],
];

const empty = { passport_no: "", candidate_name: "", mobile: "", ttc_id: "", exam_at: "", education: "", experience: "" };

function SubmitJob() {
  const { data: ttcs = [] } = useQuery(ttcQ);
  const active = ttcs.filter((t) => t.active);
  const [f, setF] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [doneRef, setDoneRef] = useState<number | null>(null);
  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = schema.safeParse(f);
    const errs: Record<string, string> = {};
    if (!r.success) r.error.issues.forEach((i) => (errs[String(i.path[0])] ??= i.message));
    if (!file) errs.file = "Takamul Appointment Ticket আপলোড করুন";
    else if (!/^(application\/pdf|image\/)/.test(file.type)) errs.file = "শুধু PDF বা ছবি দিন";
    else if (file.size > 10 * 1024 * 1024) errs.file = "ফাইল ১০MB-এর কম হতে হবে";
    setErrors(errs);
    if (Object.keys(errs).length || !r.success || !file || !agree) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const ext = file.name.split(".").pop() || "bin";
      const path = `takamul/${u.user!.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("candidate-photos").upload(path, file);
      if (up.error) throw up.error;
      const { data, error } = await supabase
        .from("job_submissions")
        .insert({ ...r.data, passport_no: r.data.passport_no.toUpperCase(), exam_at: dhakaInputToISO(r.data.exam_at)!, ticket_path: path, terms_accepted: true })
        .select("ref_no")
        .single();
      if (error) throw error;
      setDoneRef(data.ref_no);
      setF(empty); setFile(null); setAgree(false);
    } catch {
      toast.error("কাজ Submit করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  };

  if (doneRef !== null)
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
        <h1 className="mt-4 font-display text-2xl font-bold">কাজ সফলভাবে Submit হয়েছে</h1>
        <p className="mt-2 text-muted-foreground">রেফারেন্স নম্বর: <span className="font-semibold text-foreground">#{bn(doneRef)}</span></p>
        <p className="mt-1 text-sm text-muted-foreground">অ্যাডমিন অনুমোদনের অপেক্ষায় রয়েছে।</p>
        <Button className="mt-6" onClick={() => setDoneRef(null)}>নতুন কাজ Submit করুন</Button>
      </div>
    );

  const Err = ({ k }: { k: string }) => (errors[k] ? <p className="mt-1 text-xs text-destructive">{errors[k]}</p> : null);
  const Choice = ({ k, opts }: { k: "education" | "experience"; opts: [string, string][] }) => (
    <div className="grid grid-cols-2 gap-2">
      {opts.map(([v, l]) => (
        <button type="button" key={v} onClick={() => set(k, v)}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${f[k] === v ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>
          {f[k] === v ? "☑" : "☐"} {l}
        </button>
      ))}
    </div>
  );

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-display text-2xl font-bold">📋 কাজ Submit করুন</h1>

      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Passport Number *</Label><Input value={f.passport_no} onChange={(e) => set("passport_no", e.target.value)} maxLength={20} /><Err k="passport_no" /></div>
          <div><Label>Candidate Name *</Label><Input value={f.candidate_name} onChange={(e) => set("candidate_name", e.target.value)} maxLength={100} /><Err k="candidate_name" /></div>
          <div><Label>Mobile Number *</Label><Input inputMode="numeric" value={f.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="01XXXXXXXXX" /><Err k="mobile" /></div>
          <div>
            <Label>TTC Name / Location *</Label>
            <select value={f.ttc_id} onChange={(e) => set("ttc_id", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">নির্বাচন করুন</option>
              {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Err k="ttc_id" />
          </div>
          <div className="sm:col-span-2"><Label>Exam Date & Time *</Label><Input type="datetime-local" value={f.exam_at} onChange={(e) => set("exam_at", e.target.value)} /><Err k="exam_at" /></div>
        </div>
        <div><Label className="mb-2 block">শিক্ষাগত যোগ্যতা *</Label><Choice k="education" opts={[["educated", "শিক্ষিত"], ["uneducated", "মুর্খ/অশিক্ষিত"]]} /><Err k="education" /></div>
        <div><Label className="mb-2 block">কাজের অভিজ্ঞতা *</Label><Choice k="experience" opts={[["yes", "অভিজ্ঞতা আছে"], ["no", "অভিজ্ঞতা নেই"]]} /><Err k="experience" /></div>
        <div>
          <Label className="mb-2 block">Takamul Appointment Ticket (PDF / Photo) *</Label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 text-sm hover:bg-muted">
            <FileUp className="h-5 w-5 text-primary" />
            <span className="truncate">{file ? file.name : "ফাইল নির্বাচন করুন"}</span>
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Err k="file" />
        </div>
      </section>

      <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-destructive"><AlertTriangle className="h-5 w-5" /> জরুরি নির্দেশনা — কাজ Submit করার আগে</h2>
        <p className="mt-1 text-sm text-muted-foreground">অনুগ্রহ করে Submit করার পূর্বে নিচের নির্দেশনাগুলো ভালোভাবে পড়ুন:</p>
        <ul className="mt-3 space-y-2 text-sm">
          {notices.map(([i, t]) => <li key={t} className="flex gap-2"><span>{i}</span><span>{t}</span></li>)}
        </ul>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-card p-3 text-sm font-medium">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          আমি উপরের সকল নির্দেশনা পড়েছি এবং মেনে কাজ Submit করছি।
        </label>
      </section>

      <Button type="submit" size="lg" className="w-full" disabled={!agree || busy}>{busy ? "Submit হচ্ছে..." : "কাজ Submit করুন"}</Button>
    </form>
  );
}
