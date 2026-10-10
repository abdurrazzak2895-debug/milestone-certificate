import { createFileRoute, Link } from "@tanstack/react-router";
import { OccupationPicker } from "@/components/app/OccupationPicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, Camera, CheckCircle2, FileUp, Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ttcQ, occQ, dhakaInputToISO, bn } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

const BATCHES = [
  { batch: "MORNING", times: [{ value: "10:00", label: "10:00 AM" }, { value: "11:00", label: "11:00 AM" }] },
  { batch: "AFTERNOON", times: [{ value: "13:00", label: "01:00 PM" }, { value: "14:00", label: "02:00 PM" }] },
];
const BATCH_VALUES = BATCHES.flatMap((b) => b.times.map((t) => t.value)) as [string, ...string[]];

const schema = z.object({
  passport_no: z.string().trim().min(5, "সঠিক পাসপোর্ট নম্বর দিন").max(20).regex(/^[A-Za-z0-9]+$/, "সঠিক পাসপোর্ট নম্বর দিন"),
  candidate_name: z.string().trim().min(2, "প্রার্থীর নাম দিন").max(100),
  mobile: z.string().trim().regex(/^01[3-9]\d{8}$/, "১১ সংখ্যার সঠিক মোবাইল নম্বর দিন"),
  secondary_mobile: z.union([z.literal(""), z.string().regex(/^01[3-9]\d{8}$/, "অতিরিক্ত মোবাইল নম্বরটি সঠিক নয়")]),
  skill_details: z.string().trim().max(1000),
  occupation_id: z.string().uuid("পেশা নির্বাচন করুন"),
  ttc_id: z.string().uuid("TTC নির্বাচন করুন"),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "পরীক্ষার তারিখ দিন"),
  exam_time: z.enum(BATCH_VALUES, { message: "পরীক্ষার সময় নির্বাচন করুন" }),
  education: z.enum(["educated", "uneducated"], { message: "শিক্ষাগত যোগ্যতা নির্বাচন করুন" }),
  experience: z.enum(["yes", "no"], { message: "কাজের অভিজ্ঞতা নির্বাচন করুন" }),
});

const notices = [
  "পরীক্ষার আগের দিন সকাল ১০:০০টার মধ্যে প্রার্থীকে আমাদের নির্ধারিত লোকেশনে উপস্থিত হতে হবে।",
  "কোনো Payment বকেয়া থাকলে কাজ Approve করা হবে না।",
  "কাজ একবার Submit করার পর Cancel করা যাবে না।",
  "একান্তই Cancel করতে হলে পরীক্ষার কমপক্ষে ৩ দিন আগে জানাতে হবে।",
  "Takamul Appointment Ticket অবশ্যই upload করতে হবে।",
  "Submit করার আগে সকল তথ্য ভালোভাবে যাচাই করতে হবে।",
];

const empty = { passport_no: "", candidate_name: "", mobile: "", secondary_mobile: "", skill_details: "", occupation_id: "", ttc_id: "", exam_date: "", exam_time: "", education: "educated", experience: "yes" };
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function SubmitJob() {
  const qc = useQueryClient();
  const { data: ttcs = [] } = useQuery(ttcQ);
  const { data: occs = [] } = useQuery(occQ);
  const active = ttcs.filter((t) => t.active);
  const [f, setF] = useState(empty);
  const [occSearch, setOccSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [candidatePhoto, setCandidatePhoto] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [doneRef, setDoneRef] = useState<string | null>(null);
  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }));
  const occList = useMemo(() => {
    const q = occSearch.trim().toLowerCase();
    return occs.filter((o) => o.active && (!q || o.name.toLowerCase().includes(q))).slice(0, 300);
  }, [occs, occSearch]);
  const DEFAULT_OCC_NAME = "Load and Unload Worker";
  useEffect(() => {
    if (!f.occupation_id) {
      const d = occs.find((o) => o.active && o.name.toLowerCase() === DEFAULT_OCC_NAME.toLowerCase());
      if (d) setF((p) => (p.occupation_id ? p : { ...p, occupation_id: d.id }));
    }
  }, [occs, f.occupation_id]);
  useEffect(() => {
    if (!f.ttc_id) {
      const b = active.find((t) => t.name.includes("বগুড়া") || t.name.toLowerCase().includes("bogura"));
      if (b) setF((p) => (p.ttc_id ? p : { ...p, ttc_id: b.id }));
    }
  }, [active, f.ttc_id]);
  const photoUrl = useMemo(() => (candidatePhoto ? URL.createObjectURL(candidatePhoto) : null), [candidatePhoto]);

  const validate = () => {
    const r = schema.safeParse(f);
    const errs: Record<string, string> = {};
    if (!r.success) r.error.issues.forEach((i) => (errs[String(i.path[0])] ??= i.message));
    if (!file) errs.file = "Takamul Appointment Ticket আপলোড করুন";
    else if (!ALLOWED.includes(file.type)) errs.file = "শুধু PDF বা ছবি (JPG/PNG/WEBP) দিন";
    else if (file.size > 10 * 1024 * 1024) errs.file = "ফাইল ১০MB-এর কম হতে হবে";
    setErrors(errs);
    return Object.keys(errs).length === 0 && r.success ? r.data : null;
  };

  const openConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return toast.error("সব বাধ্যতামূলক তথ্য সঠিকভাবে দিন");
    setAgree(false);
    setConfirmOpen(true);
  };

  const submit = async () => {
    const d = validate();
    if (!d || !file || !agree) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন পাওয়া যায়নি");
      const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
      const path = `takamul/${u.user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("candidate-photos").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { exam_date, exam_time, ...rest } = d;
      let candidate_photo_path: string | null = null;
      if (candidatePhoto) {
        candidate_photo_path = `candidate-drafts/${u.user.id}/${crypto.randomUUID()}.${candidatePhoto.type.split("/")[1] ?? "jpg"}`;
        const photoUpload = await supabase.storage.from("candidate-photos").upload(candidate_photo_path, candidatePhoto, { contentType: candidatePhoto.type });
        if (photoUpload.error) throw photoUpload.error;
      }
      const { data, error } = await supabase
        .from("job_submissions")
        .insert({ ...rest, secondary_mobile: rest.secondary_mobile || null, skill_details: rest.skill_details || null, candidate_photo_path, passport_no: rest.passport_no.toUpperCase(), exam_at: dhakaInputToISO(`${exam_date}T${exam_time}`)!, ticket_path: path, terms_accepted: true })
        .select("ref_code")
        .single();
      if (error) throw error;
      setConfirmOpen(false);
      setDoneRef(data.ref_code);
      setF(empty); setFile(null); setCandidatePhoto(null);
      qc.invalidateQueries({ queryKey: ["works"] });
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
        <p className="mt-2 text-muted-foreground">রেফারেন্স নম্বর: <span className="font-semibold text-foreground">#{doneRef}</span></p>
        <p className="mt-1 text-sm text-muted-foreground">অ্যাডমিন অনুমোদনের অপেক্ষায় রয়েছে।</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => setDoneRef(null)}>নতুন কাজ Submit করুন</Button>
          <Button variant="outline" asChild><Link to="/my-works">আমার কাজ দেখুন</Link></Button>
        </div>
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
  const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <form onSubmit={openConfirm} className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-display text-2xl font-bold">📋 Submit Work</h1>

      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <label className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-primary/60 bg-muted hover:border-primary">
            {photoUrl ? <img src={photoUrl} alt="পরীক্ষার্থীর ছবি" className="h-full w-full object-cover" /> : <Camera className="h-8 w-8 text-muted-foreground" />}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const p = e.target.files?.[0]; setCandidatePhoto(p ? await (await import("@/lib/compress-image")).compressImage(p) : null); }} />
          </label>
          <span className="text-xs text-muted-foreground">পরীক্ষার্থীর ছবি (ঐচ্ছিক)</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Candidate Name *</Label><Input value={f.candidate_name} onChange={(e) => set("candidate_name", e.target.value.toUpperCase())} maxLength={100} /><Err k="candidate_name" /></div>
          <div><Label>Passport Number *</Label><Input value={f.passport_no} onChange={(e) => set("passport_no", e.target.value.toUpperCase())} maxLength={20} /><Err k="passport_no" /></div>
          <div><Label>Mobile Number *</Label><Input inputMode="numeric" value={f.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="01XXXXXXXXX" /><Err k="mobile" /></div>
          <div><Label>অতিরিক্ত যোগাযোগ নম্বর</Label><Input inputMode="numeric" value={f.secondary_mobile} onChange={(e) => set("secondary_mobile", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="01XXXXXXXXX" /></div>
          <div>
            <Label>TTC *</Label>
            <select value={f.ttc_id} onChange={(e) => set("ttc_id", e.target.value)} className={selectCls}>
              <option value="">নির্বাচন করুন</option>
              {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Err k="ttc_id" />
          </div>
          <div className="sm:col-span-2">
            <Label>Profession / পেশা *</Label>
            <OccupationPicker items={occList} value={f.occupation_id} onChange={(id) => set("occupation_id", id)} />
            <Err k="occupation_id" />
          </div>
          <div>
            <Label>Exam Date *</Label>
            {(() => {
              const now = new Date();
              const [yy, mm, dd] = (f.exam_date || "").split("-");
              const year = Number(yy) || now.getFullYear();
              const month = Number(mm) || now.getMonth() + 1;
              const day = Number(dd) || 0;
              const days = new Date(year, month, 0).getDate();
              const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
              const upd = (y: number, m: number, d: number) => {
                const max = new Date(y, m, 0).getDate();
                const dv = d > max ? max : d;
                set("exam_date", dv ? `${y}-${String(m).padStart(2, "0")}-${String(dv).padStart(2, "0")}` : `${y}-${String(m).padStart(2, "0")}-`);
              };
              return (
                <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
                  <select value={day || ""} onChange={(e) => upd(year, month, Number(e.target.value))} className={selectCls}>
                    <option value="">Date</option>
                    {Array.from({ length: days }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={month} onChange={(e) => upd(year, Number(e.target.value), day)} className={selectCls}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select value={year} onChange={(e) => upd(Number(e.target.value), month, day)} className={selectCls}>
                    {[0, 1, 2].map((o) => now.getFullYear() + o).map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              );
            })()}
            <Err k="exam_date" />
          </div>
          <div>
            <Label>Exam Time *</Label>
            <select value={f.exam_time} onChange={(e) => set("exam_time", e.target.value)} className={selectCls}>
              <option value="">সময় নির্বাচন করুন</option>
              {BATCHES.map((b) => (
                <optgroup key={b.batch} label={b.batch}>
                  {b.times.map((t) => <option key={t.value} value={t.value}>{t.label} ({b.batch})</option>)}
                </optgroup>
              ))}
            </select>
            <Err k="exam_time" />
          </div>
        </div>
        <div><Label className="mb-2 block">নোট</Label><Textarea value={f.skill_details} onChange={(e) => set("skill_details", e.target.value)} maxLength={1000} rows={3} placeholder="কাজের বিবরণ লিখুন..." /></div>
        <div>
          <Label className="mb-2 block">Takamul Appointment Ticket (PDF / Image) *</Label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 text-sm hover:bg-muted">
            <FileUp className="h-5 w-5 text-primary" />
            <span className="truncate">{file ? file.name : "ফাইল নির্বাচন করুন"}</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; setFile(f ? await (await import("@/lib/compress-image")).compressImage(f) : null); }} />
          </label>
          <Err k="file" />
        </div>
      </section>

      <Button type="submit" size="lg" className="w-full">কাজ Submit করুন</Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="border-destructive/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> জরুরি নির্দেশনা</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {notices.map((t) => <li key={t} className="flex gap-2"><span>•</span><span>{t}</span></li>)}
          </ul>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-muted p-3 text-sm font-medium">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            আমি উপরোক্ত সকল নির্দেশনা পড়েছি এবং সম্মত।
          </label>
          <Button type="button" size="lg" disabled={!agree || busy} onClick={submit} className="group relative h-12 overflow-hidden rounded-xl bg-gradient-to-r from-primary via-primary to-accent px-6 font-semibold text-primary-foreground shadow-[0_8px_30px_-8px_var(--primary)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-6px_var(--primary)] active:scale-95 disabled:translate-y-0 disabled:opacity-60">
            {!busy && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent animate-btn-shimmer" />}
            <span className="relative flex items-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Submit হচ্ছে..." : "Confirm & Submit"}
              {!busy && <SendHorizontal className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />}
            </span>
          </Button>
        </DialogContent>
      </Dialog>
    </form>
  );
}
