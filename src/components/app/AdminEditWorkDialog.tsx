import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Work } from "@/lib/works";
import { occQ, ttcQ } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OccupationPicker } from "@/components/app/OccupationPicker";

const SLOTS: [string, string][] = [["10:00", "10:00 AM (MORNING)"], ["11:00", "11:00 AM (MORNING)"], ["13:00", "01:00 PM (AFTERNOON)"], ["14:00", "02:00 PM (AFTERNOON)"]];
const dhakaParts = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 6 * 3600000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
};

/** Admin/staff can edit every field of a submission at any status; linked candidate + exam rows are kept in sync. */
export function AdminEditWorkDialog({ w }: { w: Work }) {
  const qc = useQueryClient();
  const { data: occ = [] } = useQuery(occQ);
  const { data: ttc = [] } = useQuery(ttcQ);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = dhakaParts(w.exam_at);
  const init = () => ({
    candidate_name: w.candidate_name, passport_no: w.passport_no, mobile: w.mobile, secondary_mobile: w.secondary_mobile ?? "",
    occupation_id: w.occupation_id ?? "", ttc_id: w.ttc_id ?? "", date: p.date, time: p.time,
    education: w.education, experience: w.experience, skill_details: w.skill_details ?? "",
  });
  const [f, setF] = useState(init);
  const set = (k: keyof ReturnType<typeof init>, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (f.candidate_name.trim().length < 2 || f.passport_no.trim().length < 5) return toast.error("নাম ও পাসপোর্ট সঠিকভাবে দিন");
    if (!/^01[3-9]\d{8}$/.test(f.mobile)) return toast.error("সঠিক মোবাইল নম্বর দিন");
    if (f.secondary_mobile && !/^01[3-9]\d{8}$/.test(f.secondary_mobile)) return toast.error("অতিরিক্ত মোবাইল সঠিক নয়");
    setBusy(true);
    const name = f.candidate_name.trim().toUpperCase();
    const passport = f.passport_no.trim().toUpperCase();
    const exam_at = new Date(`${f.date}T${f.time}:00+06:00`).toISOString();
    const r1 = await supabase.from("job_submissions").update({
      candidate_name: name, passport_no: passport, mobile: f.mobile, secondary_mobile: f.secondary_mobile || null,
      occupation_id: f.occupation_id || null, ttc_id: f.ttc_id || null, exam_at,
      education: f.education, experience: f.experience, skill_details: f.skill_details.trim() || null,
    }).eq("id", w.id);
    if (!r1.error && w.candidate_id) {
      await supabase.from("candidates").update({
        name, passport_no: passport, mobile: f.mobile, secondary_mobile: f.secondary_mobile || null,
        occupation_id: f.occupation_id || null, ttc_id: f.ttc_id || null, skill_details: f.skill_details.trim() || null,
      }).eq("id", w.candidate_id);
    }
    if (!r1.error && w.exam_id) {
      await supabase.from("exams").update({ exam_date: f.date, exam_time: `${f.time}:00`, occupation_id: f.occupation_id || null, ttc_id: f.ttc_id || null }).eq("id", w.exam_id);
    }
    setBusy(false);
    if (r1.error) return toast.error(r1.error.message);
    toast.success("সব তথ্য আপডেট হয়েছে");
    qc.invalidateQueries();
    setOpen(false);
  };
  const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setF(init()); setOpen(true); }}><Pencil className="mr-1 h-4 w-4" /> এডিট</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>অ্যাডমিন এডিট #{w.ref_code}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>নাম</Label><Input value={f.candidate_name} onChange={(e) => set("candidate_name", e.target.value)} /></div>
            <div className="space-y-1"><Label>পাসপোর্ট</Label><Input value={f.passport_no} onChange={(e) => set("passport_no", e.target.value)} /></div>
            <div className="space-y-1"><Label>মোবাইল</Label><Input inputMode="numeric" maxLength={11} value={f.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))} /></div>
            <div className="space-y-1"><Label>অতিরিক্ত মোবাইল</Label><Input inputMode="numeric" maxLength={11} value={f.secondary_mobile} onChange={(e) => set("secondary_mobile", e.target.value.replace(/\D/g, ""))} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>পেশা</Label><OccupationPicker items={occ} value={f.occupation_id} onChange={(id) => set("occupation_id", id)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>TTC</Label>
              <select className={sel} value={f.ttc_id} onChange={(e) => set("ttc_id", e.target.value)}><option value="">—</option>{ttc.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </div>
            <div className="space-y-1"><Label>পরীক্ষার তারিখ</Label><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
            <div className="space-y-1"><Label>ব্যাচ টাইম</Label>
              <select className={sel} value={f.time} onChange={(e) => set("time", e.target.value)}>
                {!SLOTS.some(([v]) => v === f.time) && <option value={f.time}>{f.time}</option>}
                {SLOTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>শিক্ষা</Label>
              <select className={sel} value={f.education} onChange={(e) => set("education", e.target.value)}><option value="educated">শিক্ষিত</option><option value="uneducated">অশিক্ষিত</option></select>
            </div>
            <div className="space-y-1"><Label>অভিজ্ঞতা</Label>
              <select className={sel} value={f.experience} onChange={(e) => set("experience", e.target.value)}><option value="yes">আছে</option><option value="no">নেই</option></select>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label>দক্ষতা</Label><Input value={f.skill_details} onChange={(e) => set("skill_details", e.target.value)} /></div>
          </div>
          <Button disabled={busy} onClick={submit}>{busy ? "সেভ হচ্ছে..." : "সেভ করুন"}</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
