import { DateSelect } from "@/components/app/DateSelect";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ScanLine, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { scanAppointment, verifyAppointment } from "@/lib/appointment-ocr.functions";
import { fmtDhakaDateTime } from "@/lib/works";

type Ext = { id: string; extracted: any; confidence: number | null; warnings: any };

export function AppointmentScan({ submissionId, examAt }: { submissionId: string; examAt: string }) {
  const scan = useServerFn(scanAppointment);
  const verify = useServerFn(verifyAppointment);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [ext, setExt] = useState<Ext | null>(null);
  const [f, setF] = useState({ date: "", time: "", rep: "", reason: "" });

  async function run() {
    setBusy(true);
    try {
      const r = await scan({ data: { submissionId } });
      if ("error" in r && r.error) return toast.error(r.error);
      const e = (r as { extraction: Ext }).extraction;
      setExt(e);
      setF({ date: e.extracted.exam_date ?? "", time: e.extracted.exam_time ?? "", rep: "", reason: "" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!ext || !f.date || !f.time) return toast.error("তারিখ ও সময় দিন");
    setBusy(true);
    try {
      const r = await verify({ data: { extractionId: ext.id, examDate: f.date, examTime: f.time, reportingTime: null, reason: f.reason || null } });
      if ("error" in r && r.error) return toast.error(r.error);
      toast.success("পরীক্ষার সময় যাচাই করে আপডেট হয়েছে");
      setExt(null);
      qc.invalidateQueries();
    } finally {
      setBusy(false);
    }
  }

  const x = ext?.extracted ?? {};
  const warnings: string[] = Array.isArray(ext?.warnings) ? ext!.warnings : [];
  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={run}>
        {busy && !ext ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanLine className="mr-1 h-4 w-4" />} টিকিট স্ক্যান
      </Button>
      <Dialog open={!!ext} onOpenChange={(o) => !o && setExt(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>টিকিট থেকে পাওয়া তথ্য যাচাই</DialogTitle></DialogHeader>
          <div className="space-y-1 text-sm">
            <p>নাম: {x.candidate_name ?? "—"} · পাসপোর্ট: {x.passport_no ?? "—"}</p>
            <p>বুকিং: {x.booking_no ?? "—"} · কেন্দ্র: {x.center ?? "—"}</p>
            <p>বর্তমান সংরক্ষিত সময়: {fmtDhakaDateTime(examAt)}</p>
            <p>নির্ভরযোগ্যতা: {Math.round((ext?.confidence ?? 0) * 100)}%</p>
          </div>
          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
              {warnings.map((w, i) => <li key={i} className="flex gap-1"><AlertTriangle className="h-4 w-4 shrink-0" />{w}</li>)}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">পরীক্ষার তারিখ<DateSelect value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            <label className="text-xs">পরীক্ষার সময়<Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
          </div>
          <Textarea placeholder="সংশোধন করলে কারণ লিখুন" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <Button disabled={busy} onClick={save}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}যাচাই করে সংরক্ষণ</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
