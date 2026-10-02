import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "./ui-bits";
import {
  candidatesQ, occQ, ttcQ, RESULTS, RESULT_LABEL, todayStr, useRefreshAll,
  type Candidate, type Exam, type ExamResult,
} from "@/lib/data";

function errMsg(e: { code?: string; message: string }) {
  if (e.code === "23505") return "এই তথ্য দিয়ে আগেই রেকর্ড আছে (ডুপ্লিকেট)";
  if (e.code === "23503") return "এই রেকর্ডের সাথে অন্য তথ্য যুক্ত আছে";
  return e.message;
}

// ---------------- Candidate ----------------
export function CandidateDialog({ open, onOpenChange, candidate }: { open: boolean; onOpenChange: (o: boolean) => void; candidate?: Candidate | null }) {
  const { data: occ } = useQuery(occQ);
  const { data: ttc } = useQuery(ttcQ);
  const refresh = useRefreshAll();
  const empty = { name: "", passport_no: "", registration_no: "", mobile: "", occupation_id: "", ttc_id: "", district: "", passport_expiry: "", date_of_birth: "", notes: "", needs_follow_up: false };
  const [f, setF] = useState(empty);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhoto(null);
    setF(candidate ? {
      name: candidate.name, passport_no: candidate.passport_no ?? "", registration_no: candidate.registration_no ?? "",
      mobile: candidate.mobile ?? "", occupation_id: candidate.occupation_id ?? "", ttc_id: candidate.ttc_id ?? "",
      district: candidate.district ?? "", passport_expiry: candidate.passport_expiry ?? "", date_of_birth: candidate.date_of_birth ?? "",
      notes: candidate.notes ?? "", needs_follow_up: candidate.needs_follow_up,
    } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidate]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return toast.error("নাম দিন");
    setBusy(true);
    try {
      let photo_url = candidate?.photo_url ?? null;
      if (photo) {
        const path = `${crypto.randomUUID()}-${photo.name.replace(/[^\w.]/g, "")}`;
        const { error } = await supabase.storage.from("candidate-photos").upload(path, photo);
        if (error) throw error;
        photo_url = path;
      }
      const row = {
        ...f,
        name: f.name.trim(),
        passport_no: f.passport_no.trim() || null,
        registration_no: f.registration_no.trim() || null,
        mobile: f.mobile || null,
        occupation_id: f.occupation_id || null,
        ttc_id: f.ttc_id || null,
        district: f.district || null,
        passport_expiry: f.passport_expiry || null,
        date_of_birth: f.date_of_birth || null,
        notes: f.notes || null,
        photo_url,
      };
      const { error } = candidate
        ? await supabase.from("candidates").update(row).eq("id", candidate.id)
        : await supabase.from("candidates").insert(row);
      if (error) throw error;
      toast.success(candidate ? "আপডেট হয়েছে" : "নতুন পরীক্ষার্থী যোগ হয়েছে");
      refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e as { message: string }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{candidate ? "পরীক্ষার্থী সম্পাদনা" : "নতুন পরীক্ষার্থী"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="নাম *"><Input value={f.name} onChange={set("name")} /></Field>
          <Field label="পাসপোর্ট নম্বর"><Input value={f.passport_no} onChange={set("passport_no")} /></Field>
          <Field label="রেজিস্ট্রেশন/আবেদন নম্বর"><Input value={f.registration_no} onChange={set("registration_no")} /></Field>
          <Field label="মোবাইল"><Input value={f.mobile} onChange={set("mobile")} inputMode="tel" /></Field>
          <Field label="পেশা">
            <NativeSelect value={f.occupation_id} onChange={set("occupation_id")}>
              <option value="">— নির্বাচন করুন —</option>
              {occ?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="টিটিসি">
            <NativeSelect value={f.ttc_id} onChange={set("ttc_id")}>
              <option value="">— নির্বাচন করুন —</option>
              {ttc?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="জেলা"><Input value={f.district} onChange={set("district")} /></Field>
          <Field label="পাসপোর্ট মেয়াদ"><Input type="date" value={f.passport_expiry} onChange={set("passport_expiry")} /></Field>
          <Field label="জন্ম তারিখ"><Input type="date" value={f.date_of_birth} onChange={set("date_of_birth")} /></Field>
          <Field label="ছবি"><Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></Field>
          <div className="sm:col-span-2"><Field label="নোট"><Textarea value={f.notes} onChange={set("notes")} rows={2} /></Field></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.needs_follow_up} onChange={(e) => setF({ ...f, needs_follow_up: e.target.checked })} className="h-4 w-4 accent-primary" />
            ফলো-আপ প্রয়োজন
          </label>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Exam ----------------
export function ExamDialog({ open, onOpenChange, exam, candidateId }: { open: boolean; onOpenChange: (o: boolean) => void; exam?: Exam | null; candidateId?: string }) {
  const { data: occ } = useQuery(occQ);
  const { data: ttc } = useQuery(ttcQ);
  const { data: cands } = useQuery(candidatesQ);
  const refresh = useRefreshAll();
  const [f, setF] = useState({ candidate_id: "", exam_date: todayStr(), exam_time: "10:00", ttc_id: "", occupation_id: "", exam_type: "নিয়মিত", result: "PENDING" as ExamResult, result_date: "", score: "", remarks: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (exam) {
      setF({ candidate_id: exam.candidate_id, exam_date: exam.exam_date, exam_time: exam.exam_time?.slice(0, 5) ?? "", ttc_id: exam.ttc_id ?? "", occupation_id: exam.occupation_id ?? "", exam_type: exam.exam_type, result: exam.result, result_date: exam.result_date ?? "", score: exam.score?.toString() ?? "", remarks: exam.remarks ?? "" });
    } else {
      const c = cands?.find((x) => x.id === candidateId);
      setF({ candidate_id: candidateId ?? "", exam_date: todayStr(), exam_time: "10:00", ttc_id: c?.ttc_id ?? "", occupation_id: c?.occupation_id ?? "", exam_type: "নিয়মিত", result: "PENDING", result_date: "", score: "", remarks: "" });
    }
  }, [open, exam, candidateId, cands]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    const next = { ...f, [k]: e.target.value };
    if (k === "candidate_id" && !exam) {
      const c = cands?.find((x) => x.id === e.target.value);
      next.ttc_id = c?.ttc_id ?? next.ttc_id;
      next.occupation_id = c?.occupation_id ?? next.occupation_id;
    }
    setF(next);
  };

  const save = async () => {
    if (!f.candidate_id) return toast.error("পরীক্ষার্থী নির্বাচন করুন");
    setBusy(true);
    const row = {
      candidate_id: f.candidate_id, exam_date: f.exam_date, exam_time: f.exam_time || null, ttc_id: f.ttc_id || null,
      occupation_id: f.occupation_id || null, exam_type: f.exam_type || "নিয়মিত", result: f.result,
      result_date: f.result !== "PENDING" ? f.result_date || todayStr() : null,
      score: f.score ? Number(f.score) : null, remarks: f.remarks || null,
    };
    const { error } = exam ? await supabase.from("exams").update(row).eq("id", exam.id) : await supabase.from("exams").insert(row);
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(exam ? "পরীক্ষা আপডেট হয়েছে" : "নতুন পরীক্ষা যোগ হয়েছে");
    refresh();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{exam ? "পরীক্ষা সম্পাদনা" : "নতুন পরীক্ষা"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="পরীক্ষার্থী *">
              <NativeSelect value={f.candidate_id} onChange={set("candidate_id")} disabled={!!exam || !!candidateId}>
                <option value="">— নির্বাচন করুন —</option>
                {cands?.map((c) => <option key={c.id} value={c.id}>{c.name} {c.passport_no ? `(${c.passport_no})` : ""}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="পরীক্ষার তারিখ"><Input type="date" value={f.exam_date} onChange={set("exam_date")} /></Field>
          <Field label="সময়"><Input type="time" value={f.exam_time} onChange={set("exam_time")} /></Field>
          <Field label="টিটিসি">
            <NativeSelect value={f.ttc_id} onChange={set("ttc_id")}>
              <option value="">—</option>
              {ttc?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="পেশা">
            <NativeSelect value={f.occupation_id} onChange={set("occupation_id")}>
              <option value="">—</option>
              {occ?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="পরীক্ষার ধরন">
            <NativeSelect value={f.exam_type} onChange={set("exam_type")}>
              <option>নিয়মিত</option><option>পুনঃপরীক্ষা</option><option>প্র্যাকটিক্যাল</option><option>লিখিত</option>
            </NativeSelect>
          </Field>
          <Field label="রেজাল্ট">
            <NativeSelect value={f.result} onChange={set("result")}>
              {RESULTS.map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}
            </NativeSelect>
          </Field>
          {f.result !== "PENDING" && <Field label="রেজাল্টের তারিখ"><Input type="date" value={f.result_date} onChange={set("result_date")} /></Field>}
          <Field label="স্কোর"><Input type="number" value={f.score} onChange={set("score")} /></Field>
          <div className="sm:col-span-2"><Field label="মন্তব্য"><Textarea value={f.remarks} onChange={set("remarks")} rows={2} /></Field></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Quick result ----------------
export function ResultDialog({ open, onOpenChange, exam }: { open: boolean; onOpenChange: (o: boolean) => void; exam: Exam | null }) {
  const refresh = useRefreshAll();
  const [result, setResult] = useState<ExamResult>("PASS");
  const [date, setDate] = useState(todayStr());
  const [score, setScore] = useState("");
  useEffect(() => {
    if (open && exam) {
      setResult(exam.result === "PENDING" ? "PASS" : exam.result);
      setDate(exam.result_date ?? todayStr());
      setScore(exam.score?.toString() ?? "");
    }
  }, [open, exam]);
  const save = async () => {
    if (!exam) return;
    const { error } = await supabase.from("exams").update({ result, result_date: result === "PENDING" ? null : date, score: score ? Number(score) : null }).eq("id", exam.id);
    if (error) return toast.error(error.message);
    toast.success("রেজাল্ট সংরক্ষিত হয়েছে");
    refresh();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>রেজাল্ট আপডেট</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {RESULTS.map((r) => (
            <Button key={r} type="button" variant={result === r ? "default" : "outline"} onClick={() => setResult(r)}>{RESULT_LABEL[r]}</Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="রেজাল্টের তারিখ"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="স্কোর"><Input type="number" value={score} onChange={(e) => setScore(e.target.value)} /></Field>
        </div>
        <DialogFooter><Button onClick={save}>সংরক্ষণ করুন</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
