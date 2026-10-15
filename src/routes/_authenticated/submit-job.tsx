import { createFileRoute, Link } from "@tanstack/react-router";
import { OccupationPicker } from "@/components/app/OccupationPicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { WorkerLoader } from "@/components/app/WorkerLoader";
import { PassportHistory, passportHistoryQ } from "@/components/app/PassportHistory";
import { AlertTriangle, Camera, CheckCircle2, FileUp, SendHorizontal, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ttcQ, occQ, dhakaInputToISO, bn } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SmartTicketUpload, fieldStatus, type Stage, type FieldCheck } from "@/components/app/SmartTicketUpload";
import type { TicketExtraction } from "@/lib/ticket-extract.functions";

export const Route = createFileRoute("/_authenticated/submit-job")({
  head: () => ({
    meta: [
      { title: "কাজ Submit করুন — এজেন্ট | Milestone Certificate Institute" },
      { name: "description", content: "এজেন্টদের জন্য পরীক্ষার্থীর কাজ Submit করার ফর্ম।" },
      { property: "og:title", content: "কাজ Submit করুন — এজেন্ট | Milestone Certificate Institute" },
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

const empty = { passport_no: "", candidate_name: "", mobile: "", secondary_mobile: "", skill_details: "", result_email: "", result_password: "", other_info: "", occupation_id: "", ttc_id: "", exam_date: "", exam_time: "", education: "educated", experience: "yes" };
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function SubmitJob() {
  const qc = useQueryClient();
  const { data: ttcs = [] } = useQuery(ttcQ);
  const { data: occs = [] } = useQuery(occQ);
  const active = ttcs.filter((t) => t.active);
  const [f, setF] = useState(empty);
  const [walkKey, setWalkKey] = useState(0);
  const [occSearch, setOccSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [candidatePhoto, setCandidatePhoto] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [doneRef, setDoneRef] = useState<string | null>(null);
  const [ocr, setOcr] = useState<TicketExtraction | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [critOk, setCritOk] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }));
  const applyOcr = (x: TicketExtraction) => {
    setOcr(x); setCritOk(false);
    const lc = (v: string | null) => (v ?? "").toLowerCase();
    const occ = x.occupation.value ? (occs ?? []).find((o) => lc(o.name).includes(lc(x.occupation.value)) || lc(x.occupation.value).includes(lc(o.name))) : undefined;
    const ttc = x.center.value ? (ttcs ?? []).find((t) => lc(x.center.value).includes(lc(t.name).split(/\s+/)[0] ?? "~")) : undefined;
    const time = x.exam_time.value && BATCH_VALUES.includes(x.exam_time.value) ? x.exam_time.value : "";
    setF((p) => ({ ...p,
      ...(x.candidate_name.value && { candidate_name: x.candidate_name.value.toUpperCase() }),
      ...(x.passport_no.value && { passport_no: x.passport_no.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }),
      ...(x.exam_date.value && /^\d{4}-\d{2}-\d{2}$/.test(x.exam_date.value) && { exam_date: x.exam_date.value }),
      ...(time && { exam_time: time }),
      ...(occ && { occupation_id: occ.id }),
      ...(ttc && { ttc_id: ttc.id }),
    }));
    const low = Object.values(x).some((v) => typeof v === "object" && v && "confidence" in v && (v as { value: unknown }).value && (v as { confidence: number }).confidence < 0.9);
    setStage(x.ambiguities.length || x.candidate_count > 1 || low ? "review" : "done");
  };
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

  const ocrWarnings = ocr ? [
    ...ocr.ambiguities,
    ...(ocr.candidate_count > 1 ? ["টিকিটে একাধিক পরীক্ষার্থী আছে — শুধু একজনের তথ্য নেওয়া হয়েছে"] : []),
    ...(ocr.exam_time.value && !BATCH_VALUES.includes(ocr.exam_time.value) ? [`টিকিটের সময় ${ocr.exam_time.value} তালিকায় নেই — সময় নিজে বাছাই করুন`] : []),
    ...(ocr.occupation.value && !occs?.some((o) => o.id === f.occupation_id && o.name.toLowerCase().includes(ocr.occupation.value!.toLowerCase())) ? [`টিকিটের পেশা: ${ocr.occupation.value} — মিলিয়ে নিন`] : []),
  ] : [];
  const checks: FieldCheck[] = ocr ? [
    { label: "Candidate Name", extracted: ocr.candidate_name.value?.toUpperCase() ?? null, current: f.candidate_name, confidence: ocr.candidate_name.confidence },
    { label: "Passport Number", extracted: ocr.passport_no.value?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null, current: f.passport_no, confidence: ocr.passport_no.confidence },
    { label: "Exam Date", extracted: ocr.exam_date.value, current: f.exam_date, confidence: ocr.exam_date.confidence },
    { label: "Exam Time", extracted: ocr.exam_time.value, current: f.exam_time, confidence: ocr.exam_time.confidence },
  ] : [];
  const critical = checks.slice(0, 2).some((c) => fieldStatus(c) === "mismatch");

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

  const openConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return toast.error("সব বাধ্যতামূলক তথ্য সঠিকভাবে দিন");
    if (critical && !critOk) return toast.error("নাম/পাসপোর্ট টিকিটের সাথে মিলছে না — ঠিক করুন অথবা নিশ্চিত করার বক্সে টিক দিন");
    const hist = await qc.fetchQuery(passportHistoryQ(f.passport_no)).catch(() => []);
    if (hist.some((r) => r.blocking)) return toast.error("এই পাসপোর্ট নম্বর আগে জমা দেওয়া আছে — দ্বিতীয়বার জমা দেওয়া যাবে না");
    if (hist.length) toast.warning("এই পাসপোর্ট আগে জমা হয়েছিল (FAIL/বাতিল) — নিচের ইতিহাস যাচাই করুন");
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
        .insert({ ...rest, secondary_mobile: rest.secondary_mobile || null, skill_details: [rest.skill_details, f.result_email.trim() && `Result Email: ${f.result_email.trim()}`, f.result_password.trim() && `Result Password: ${f.result_password.trim()}`, f.other_info.trim() && `অন্যান্য: ${f.other_info.trim()}`].filter(Boolean).join("\n").slice(0, 2000) || null, candidate_photo_path, passport_no: rest.passport_no.toUpperCase(), exam_at: dhakaInputToISO(`${exam_date}T${exam_time}`)!, ticket_path: path, terms_accepted: true, ocr_meta: ocr ? JSON.parse(JSON.stringify({ extracted: ocr, overall: checks.length ? checks.reduce((a, c) => a + (c.extracted ? c.confidence : 0), 0) / checks.length : 0, fields: checks.map((c) => ({ ...c, status: fieldStatus(c) })), warnings: ocrWarnings, confirmed_mismatch: critical && critOk, at: new Date().toISOString() })) : null })
        .select("ref_code")
        .single();
      if (error) throw error;
      setOk(true);
      setTimeout(() => {
        setConfirmOpen(false);
        setOk(false);
        setDoneRef(data.ref_code);
      }, 900);
      setF(empty); setFile(null); setCandidatePhoto(null); setOcr(null); setStage("idle");
      qc.invalidateQueries({ queryKey: ["works"] });
    } catch (err) {
      toast.error(String((err as { message?: string })?.message ?? "").includes("DUPLICATE_PASSPORT") ? "এই পাসপোর্ট নম্বর আগে জমা দেওয়া আছে — দ্বিতীয়বার জমা দেওয়া যাবে না" : "কাজ Submit করা যায়নি। আবার চেষ্টা করুন।");
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
      <SmartTicketUpload file={file} onFile={setFile} onExtract={applyOcr} checks={checks} warnings={ocrWarnings} stage={stage} setStage={setStage} />
      {critical && (
        <label className="flex items-start gap-2 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <input type="checkbox" className="mt-1" checked={critOk} onChange={(e) => setCritOk(e.target.checked)} />
          নাম/পাসপোর্ট টিকিটের সাথে মিলছে না। আমি মূল PDF মিলিয়ে নিশ্চিত হয়েছি যে ফর্মের তথ্য সঠিক।
        </label>
      )}

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
          <div><Label>Passport Number *</Label><Input value={f.passport_no} onChange={(e) => set("passport_no", e.target.value.toUpperCase())} maxLength={20} /><Err k="passport_no" /><PassportHistory passport={f.passport_no} /></div>
          <div><Label>Mobile Number *</Label><Input inputMode="numeric" value={f.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="01XXXXXXXXX" /><p className="mt-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">⚠️ শুধুমাত্র পরীক্ষার্থীর নিজের মোবাইল নম্বর দিন — এজেন্ট/নিজের নম্বর দেবেন না।</p><Err k="mobile" /></div>
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
        <div className="grid gap-4 rounded-xl border border-dashed p-3 sm:grid-cols-2">
          <p className="text-sm font-semibold sm:col-span-2">রেজাল্ট চেকের তথ্য (ঐচ্ছিক)</p>
          <div><Label>Email</Label><Input type="email" value={f.result_email} onChange={(e) => set("result_email", e.target.value)} maxLength={120} placeholder="example@gmail.com" /></div>
          <div><Label>Password</Label><Input value={f.result_password} onChange={(e) => set("result_password", e.target.value)} maxLength={100} placeholder="পাসওয়ার্ড" /></div>
          <div className="sm:col-span-2"><Label>অন্যান্য</Label><Textarea value={f.other_info} onChange={(e) => set("other_info", e.target.value)} maxLength={500} rows={2} placeholder="অন্য কিছু লিখুন..." /></div>
        </div>
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

      <Button
        type="submit"
        size="lg"
        onClick={() => setWalkKey((k) => k + 1)}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        className={`group relative h-14 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-primary to-accent text-base font-bold text-primary-foreground ring-1 ring-primary-foreground/10 transition-all duration-300 sm:h-12 sm:text-sm ${
          pressed
            ? "scale-[0.97] shadow-[0_4px_15px_-8px_var(--primary)] brightness-90"
            : "shadow-[0_10px_35px_-10px_var(--primary)] hover:-translate-y-0.5 hover:shadow-[0_16px_45px_-8px_var(--primary)]"
        }`}
      >
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent animate-btn-shimmer" />
        {walkKey > 0 && (
          <span key={walkKey} aria-hidden className="pointer-events-none absolute bottom-0.5 animate-trolley-walk">
            <svg viewBox="0 0 48 32" className="h-9 w-12 animate-trolley-bob" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="5" r="3" fill="currentColor" />
              <path d="M10 8 L12 18 M11 11 L20 13 M12 18 L8 27 M12 18 L16 27" />
              <path d="M20 9 L22 26 L40 26" />
              <rect x="25" y="13" width="12" height="12" rx="1" fill="currentColor" fillOpacity="0.35" />
              <circle cx="24" cy="28.5" r="2.5" fill="currentColor" />
              <circle cx="38" cy="28.5" r="2.5" fill="currentColor" />
            </svg>
          </span>
        )}
        <span className="relative flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5" />
          কাজ Submit করুন
          <SendHorizontal className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1.5" />
        </span>
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="border-destructive/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> জরুরি নির্দেশনা</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border bg-muted/50 p-3 text-sm">
            <p className="mb-2 font-semibold">তথ্য যাচাই করুন</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {([
                ["নাম", f.candidate_name],
                ["পাসপোর্ট", f.passport_no.toUpperCase()],
                ["মোবাইল", [f.mobile, f.secondary_mobile].filter(Boolean).join(", ")],
                ["পেশা", occs.find((o) => o.id === f.occupation_id)?.name ?? ""],
                ["TTC", ttcs.find((t) => t.id === f.ttc_id)?.name ?? ""],
                ["তারিখ", f.exam_date],
                ["সময়", BATCHES.flatMap((b) => b.times.map((t) => `${t.label} (${b.batch})`)).find((_, i) => BATCH_VALUES[i] === f.exam_time) ?? ""],
                ["টিকেট", file?.name ?? ""],
                ["ছবি", candidatePhoto ? "আছে" : "নেই"],
                ...(f.skill_details ? [["নোট", f.skill_details]] : []),
                ...(f.result_email ? [["Email", f.result_email]] : []),
                ...(f.result_password ? [["Password", f.result_password]] : []),
                ...(f.other_info ? [["অন্যান্য", f.other_info]] : []),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted-foreground">{k}:</dt><dd className="break-words font-medium">{v || "—"}</dd></div>
              ))}
            </dl>
          </div>
          <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
            {notices.map((t) => <li key={t} className="flex gap-2"><span>•</span><span>{t}</span></li>)}
          </ul>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-muted p-3 text-sm font-medium">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            আমি উপরোক্ত সকল নির্দেশনা পড়েছি এবং সম্মত।
          </label>
          <Button
            type="button"
            size="lg"
            disabled={!agree || busy || ok}
            onClick={submit}
            className={`group relative h-12 overflow-hidden rounded-xl px-6 text-sm font-semibold text-primary-foreground transition-all duration-300 active:scale-95 disabled:translate-y-0 ${
              ok
                ? "bg-green-600 shadow-[0_8px_30px_-8px_#16a34a]"
                : "bg-gradient-to-r from-primary via-primary to-accent shadow-[0_8px_30px_-8px_var(--primary)] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-6px_var(--primary)] disabled:opacity-60"
            }`}
          >
            {!busy && !ok && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary-foreground/30 to-transparent animate-btn-shimmer" />}
            <span className="relative flex items-center gap-2">
              {ok ? (
                <>
                  <CheckCircle2 className="h-5 w-5 animate-in zoom-in-50" />
                  সফলভাবে Submit হয়েছে ✓
                </>
              ) : busy ? (
                <>
                  <span className="text-primary-foreground"><WorkerLoader size="sm" /></span>
                  Submit হচ্ছে...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Confirm & Submit
                  <SendHorizontal className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </span>
          </Button>
        </DialogContent>
      </Dialog>
    </form>
  );
}
