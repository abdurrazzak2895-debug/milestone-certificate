import { CandidatePhoto } from "@/components/app/CandidatePhoto";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { worksQ, fmtDhakaDateTime } from "@/lib/works";
import { ttcQ, occQ, lookup, bn } from "@/lib/data";
import { checkSubmissionSvp } from "@/lib/svp.functions";
import { StatusPill, SvpPill } from "@/components/app/WorkBits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/provider")({
  head: () => ({
    meta: [
      { title: "সার্ভিস প্রোভাইডার — অনুমোদিত কাজ" },
      { name: "description", content: "অ্যাডমিন অনুমোদিত কাজের তালিকা ও SVP রেজাল্ট।" },
      { property: "og:title", content: "সার্ভিস প্রোভাইডার — অনুমোদিত কাজ" },
      { property: "og:description", content: "অ্যাডমিন অনুমোদিত কাজের তালিকা ও SVP রেজাল্ট।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Provider,
});

function Provider() {
  const qc = useQueryClient();
  const { data = [] } = useQuery(worksQ);
  const ttc = lookup(useQuery(ttcQ).data);
  const occ = lookup(useQuery(occQ).data);
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const works = data.filter((w) => w.status === "approved").filter((w) => !s || [w.candidate_name, w.passport_no, w.mobile, occ(w.occupation_id)].some((v) => v?.toLowerCase().includes(s)));
  const [busy, setBusy] = useState<string | null>(null);

  const check = async (id: string) => {
    setBusy(id);
    const r = await checkSubmissionSvp({ data: { id } }).catch(() => ({ status: "error" as const, message: "চেক করা যায়নি" }));
    setBusy(null);
    if (r.status === "error") toast.error(r.message);
    else toast.success(r.status === "found" ? `SVP রেজাল্ট: ${r.result}` : "SVP-তে রেজাল্ট পাওয়া যায়নি");
    qc.invalidateQueries({ queryKey: ["works"] });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="font-display text-2xl font-bold">অনুমোদিত কাজ ({bn(works.length)})</h1>
      <input className="h-10 w-full rounded-lg border bg-card px-3 text-sm" placeholder="নাম / পাসপোর্ট / মোবাইল / পেশা দিয়ে খুঁজুন" value={q} onChange={(e) => setQ(e.target.value)} />
      {works.length === 0 ? <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">এখনো কোনো অনুমোদিত কাজ নেই।</p> : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
               <tr>{["নাম", "পাসপোর্ট", "পেশা", "TTC", "তারিখ ও সময়", "রিসেপশন", "SVP রেজাল্ট", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {works.map((w) => (
                <tr key={w.id}>
                  <td className="px-3 py-2 font-medium"><div className="flex items-center gap-2"><CandidatePhoto path={w.candidate_photo_path} name={w.candidate_name} size={36} />{w.candidate_name}</div></td>
                  <td className="px-3 py-2">{w.passport_no}</td>
                  <td className="px-3 py-2">{occ(w.occupation_id)}</td>
                  <td className="px-3 py-2">{ttc(w.ttc_id)}</td>
                  <td className="px-3 py-2">{fmtDhakaDateTime(w.exam_at)}</td>
                   <td className="px-3 py-2"><StatusPill status={w.arrival_status} /></td>
                  <td className="px-3 py-2"><SvpPill result={w.svp_result} /></td>
                  <td className="px-3 py-2"><Button size="sm" variant="outline" disabled={busy === w.id} onClick={() => check(w.id)}><RefreshCw className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
