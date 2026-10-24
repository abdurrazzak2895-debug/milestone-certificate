import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateMySubmission } from "@/lib/workflow.functions";
import type { Work } from "@/lib/works";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhotoInput } from "@/components/app/PhotoInput";

const toDhakaLocal = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 6 * 3600000);
  return d.toISOString().slice(0, 16);
};

export function EditWorkDialog({ w }: { w: Work }) {
  const qc = useQueryClient();
  const save = useServerFn(updateMySubmission);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [f, setF] = useState({
    candidate_name: w.candidate_name,
    passport_no: w.passport_no,
    mobile: w.mobile,
    secondary_mobile: w.secondary_mobile ?? "",
    skill_details: w.skill_details ?? "",
    exam_at: toDhakaLocal(w.exam_at),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true);
    try {
      let photoPath: string | null = null;
      if (photo) {
        const { data: u } = await supabase.auth.getUser();
        photoPath = `candidate-drafts/${u.user!.id}/${crypto.randomUUID()}.${photo.type.split("/")[1] ?? "jpg"}`;
        const up = await supabase.storage
          .from("candidate-photos")
          .upload(photoPath, photo, { contentType: photo.type });
        if (up.error) throw up.error;
      }
      await save({
        data: {
          id: w.id,
          candidate_name: f.candidate_name,
          passport_no: f.passport_no,
          mobile: f.mobile,
          secondary_mobile: f.secondary_mobile || null,
          skill_details: f.skill_details || null,
          exam_at: new Date(`${f.exam_at}:00+06:00`).toISOString(),
          photoPath,
        },
      });
      toast.success("কাজ আপডেট হয়েছে");
      qc.invalidateQueries({ queryKey: ["works"] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "আপডেট করা যায়নি");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}>
        <Pencil className="mr-1 h-4 w-4" /> এডিট
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>কাজ এডিট করুন #{w.ref_code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>পরীক্ষার্থীর নাম</Label>
              <Input value={f.candidate_name} onChange={set("candidate_name")} />
            </div>
            <div>
              <Label>পাসপোর্ট নং</Label>
              <Input value={f.passport_no} onChange={set("passport_no")} />
            </div>
            <div>
              <Label>মোবাইল</Label>
              <Input value={f.mobile} onChange={set("mobile")} />
            </div>
            <div>
              <Label>বিকল্প মোবাইল</Label>
              <Input value={f.secondary_mobile} onChange={set("secondary_mobile")} />
            </div>
            <div>
              <Label>পরীক্ষার তারিখ ও সময়</Label>
              <Input type="datetime-local" value={f.exam_at} onChange={set("exam_at")} />
            </div>
            <div>
              <Label>দক্ষতার বিবরণ</Label>
              <Input value={f.skill_details} onChange={set("skill_details")} />
            </div>
            <div>
              <Label>নতুন ছবি (ঐচ্ছিক)</Label>
              <PhotoInput onFile={setPhoto} />
            </div>
            <Button className="w-full" disabled={busy} onClick={submit}>
              {busy ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
