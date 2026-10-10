import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { updateCandidateMobile } from "@/lib/workflow.functions";
import type { Work } from "@/lib/works";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ok = (v: string) => /^01[3-9]\d{8}$/.test(v);

export function EditMobileDialog({ w }: { w: Work }) {
  const qc = useQueryClient();
  const save = useServerFn(updateCandidateMobile);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(w.mobile);
  const [m2, setM2] = useState(w.secondary_mobile ?? "");
  const submit = async () => {
    if (!ok(m) || (m2 && !ok(m2))) return toast.error("সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন");
    setBusy(true);
    try {
      await save({ data: { id: w.id, mobile: m, secondary_mobile: m2 || null } });
      toast.success("মোবাইল নম্বর আপডেট হয়েছে");
      qc.invalidateQueries({ queryKey: ["works"] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "আপডেট করা যায়নি");
    } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}><Phone className="mr-1 h-4 w-4" /> মোবাইল পরিবর্তন</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>মোবাইল নম্বর পরিবর্তন #{w.ref_code}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>মোবাইল</Label><Input inputMode="numeric" maxLength={11} value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, ""))} /></div>
            <div><Label>বিকল্প মোবাইল</Label><Input inputMode="numeric" maxLength={11} value={m2} onChange={(e) => setM2(e.target.value.replace(/\D/g, ""))} /></div>
            <Button className="w-full" disabled={busy} onClick={submit}>{busy ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
