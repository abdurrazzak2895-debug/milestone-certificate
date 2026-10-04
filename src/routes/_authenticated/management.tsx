import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, UserCheck, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { worksQ, fmtDhakaDateTime, type Work } from "@/lib/works";
import { receiveCandidate } from "@/lib/workflow.functions";
import { ttcQ, occQ, lookup, bn } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusPill, SvpPill } from "@/components/app/WorkBits";

export const Route = createFileRoute("/_authenticated/management")({
  head: () => ({ meta: [
    { title: "পরীক্ষার্থী রিসেপশন — ম্যানেজমেন্ট" },
    { name: "description", content: "অনুমোদিত পরীক্ষার্থীর উপস্থিতি, যোগাযোগ, ছবি ও দক্ষতার তথ্য পরিচালনা।" },
    { property: "og:title", content: "পরীক্ষার্থী রিসেপশন" },
    { property: "og:description", content: "অনুমোদিত পরীক্ষার্থীর উপস্থিতি ও তথ্য পরিচালনা।" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ManagementPage,
});

const ARRIVAL: Record<string, string> = { not_arrived: "এখনো আসেননি", received: "রিসিভ করা হয়েছে", absent: "অনুপস্থিত" };

function ManagementPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery(worksQ);
  const works = data.filter((work) => work.status === "approved").sort((a, b) => a.exam_at.localeCompare(b.exam_at));
  const ttc = lookup(useQuery(ttcQ).data);
  const occ = lookup(useQuery(occQ).data);
  return <div className="mx-auto max-w-4xl space-y-4">
    <h1 className="font-display text-2xl font-bold">পরীক্ষার্থী রিসেপশন ({bn(works.length)})</h1>
    {works.length === 0 ? <p className="card-surface p-6 text-center text-muted-foreground">অনুমোদিত পরীক্ষার্থী নেই।</p> : works.map((work) => (
      <ReceptionCard key={work.id} work={work} ttc={ttc} occ={occ} done={() => qc.invalidateQueries({ queryKey: ["works"] })} />
    ))}
  </div>;
}

function ReceptionCard({ work, ttc, occ, done }: { work: Work; ttc: (id: string | null) => string; occ: (id: string | null) => string; done: () => void }) {
  const [mobile, setMobile] = useState(work.secondary_mobile ?? "");
  const [skills, setSkills] = useState(work.skill_details ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (arrivalStatus: "not_arrived" | "received" | "absent") => {
    if (mobile && !/^01[3-9]\d{8}$/.test(mobile)) return toast.error("অতিরিক্ত মোবাইল নম্বরটি সঠিক নয়");
    setBusy(true);
    try {
      let photoPath = work.candidate_photo_path;
      if (photo) {
        const path = `candidates/${work.id}/${crypto.randomUUID()}.${photo.type.split("/")[1] ?? "jpg"}`;
        const { error } = await supabase.storage.from("candidate-photos").upload(path, photo, { contentType: photo.type });
        if (error) throw error;
        photoPath = path;
      }
      await receiveCandidate({ data: { id: work.id, arrivalStatus, secondaryMobile: mobile || null, skillDetails: skills.trim() || null, photoPath } });
      toast.success("পরীক্ষার্থীর অবস্থা আপডেট হয়েছে");
      done();
    } catch { toast.error("তথ্য আপডেট করা যায়নি"); }
    finally { setBusy(false); }
  };
  return <section className="card-surface space-y-4 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="font-semibold">{work.candidate_name} <span className="text-sm text-muted-foreground">#{bn(work.ref_no)}</span></h2><p className="text-sm text-muted-foreground">{work.passport_no} · {work.mobile}</p></div>
      <div className="flex gap-2"><StatusPill status={work.arrival_status} /><SvpPill result={work.svp_result} /></div>
    </div>
    <p className="text-sm text-muted-foreground">{occ(work.occupation_id)} · {ttc(work.ttc_id)} · {fmtDhakaDateTime(work.exam_at)}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label>অতিরিক্ত যোগাযোগ নম্বর</Label><Input inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))} /></div>
      <div><Label>পরীক্ষার্থীর ছবি</Label><Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></div>
      <div className="sm:col-span-2"><Label>দক্ষতা সম্পর্কে তথ্য</Label><Textarea value={skills} onChange={(e) => setSkills(e.target.value)} maxLength={1000} rows={2} /></div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => save("received")}><UserCheck className="h-4 w-4" /> রিসিভ করুন</Button>
      <Button disabled={busy} variant="destructive" onClick={() => save("absent")}><UserX className="h-4 w-4" /> অনুপস্থিত</Button>
      {work.arrival_status !== "not_arrived" && <Button disabled={busy} variant="outline" onClick={() => save("not_arrived")}><CheckCircle2 className="h-4 w-4" /> অপেক্ষমান করুন</Button>}
      {photo && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Camera className="h-4 w-4" /> ছবি নির্বাচিত</span>}
    </div>
    <p className="text-xs text-muted-foreground">বর্তমান অবস্থা: {ARRIVAL[work.arrival_status] ?? work.arrival_status}</p>
  </section>;
}