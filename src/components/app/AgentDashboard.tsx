import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, Camera, CheckCircle2, Clock, FilePlus2, ListChecks, Megaphone, Search, XCircle, Award } from "lucide-react";
import { worksQ, myAccountQ } from "@/lib/works";
import { bn, occQ, lookup } from "@/lib/data";
import { CandidatePhoto } from "@/components/app/CandidatePhoto";
import { agentNoticeQ } from "@/components/app/AgentNotice";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { OfficeAddress } from "@/components/app/OfficeAddress";

const dhakaDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
const dayOffset = (n: number) => dhakaDay(new Date(Date.now() + n * 86400000));
const fmtT = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
const DAYS = [[0, "আজ"], [1, "আগামীকাল"], [2, "পরশু"]] as const;

export function AgentDashboard() {
  const { data: works = [] } = useQuery(worksQ);
  const { data: me } = useQuery(myAccountQ);
  const occ = lookup(useQuery(occQ).data);
  const [day, setDay] = useState<0 | 1 | 2>(0);
  const count = (s: string) => works.filter((w) => w.status === s).length;
  const cards = [
    { label: "আমার সব কাজ", value: works.length, icon: ListChecks, tab: "all" },
    { label: "অপেক্ষমান", value: count("pending_approval"), icon: Clock, tab: "active" },
    { label: "অনুমোদিত", value: count("approved"), icon: CheckCircle2, tab: "active" },
    { label: "বাতিল", value: count("rejected"), icon: XCircle, tab: "rejected" },
    { label: "SVP PASS", value: works.filter((w) => w.svp_result === "PASS").length, icon: Award, tab: "done" },
  ] as const;
  const onDay = (n: number) =>
    works
      .filter((w) => w.status !== "rejected" && !!w.exam_at && dhakaDay(new Date(w.exam_at)) === dayOffset(n))
      .sort((a, b) => a.exam_at.localeCompare(b.exam_at));
  const list = onDay(day);

  const qc = useQueryClient();
  const avatarPath = me ? `candidate-drafts/${me.user_id}/agent-profile.jpg` : null;
  const camRef = useRef<HTMLInputElement>(null);
  const uploadAvatar = async (f?: File) => {
    if (!f || !avatarPath) return;
    try {
      const img = await compressImage(f);
      const { error } = await supabase.storage.from("candidate-photos").upload(avatarPath, img, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      toast.success("প্রোফাইল ছবি আপডেট হয়েছে");
      qc.invalidateQueries({ queryKey: ["photo", avatarPath] });
    } catch { toast.error("ছবি আপলোড করা যায়নি"); }
  };
  const { data: notice = "" } = useQuery(agentNoticeQ);
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase().replace(/^#/, "");
  const hits = s ? works.filter((w) => [w.candidate_name, w.passport_no, w.mobile, w.secondary_mobile, w.ref_code, occ(w.occupation_id)].some((v) => v?.toLowerCase().includes(s))).slice(0, 20) : [];
  const byOcc = Object.entries(list.reduce<Record<string, typeof list>>((a, w) => { const k = w.occupation_id ? occ(w.occupation_id) : "—"; (a[k] ||= []).push(w); return a; }, {})).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-2 shadow-sm">
        <button onClick={() => camRef.current?.click()} title="প্রোফাইল ছবি" className="relative">
          <CandidatePhoto path={avatarPath} name={me?.full_name ?? "A"} size={40} />
          <Camera className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
        </button>
        <input ref={camRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-display font-bold">এজেন্ট ড্যাশবোর্ড</span>
          <span className="font-semibold">· {me?.full_name ?? "—"}</span>
          <span className="text-muted-foreground">· ID: {me?.agent_code ?? "—"} · {me?.mobile ?? ""}</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-primary/50 bg-primary/10 shadow-[0_0_18px_-6px_hsl(var(--primary))]">
        <div className="flex items-center gap-2 border-b border-primary/30 px-4 py-2 font-semibold"><Megaphone className="h-5 w-5 text-primary" /> নোটিশ বোর্ড</div>
        <div className="overflow-hidden px-4 py-4">
          <p className="animate-marquee whitespace-nowrap text-base font-medium sm:text-lg">{notice || "এই মুহূর্তে কোনো নোটিশ নেই।"}</p>
        </div>
      </section>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className="h-11 w-full rounded-xl border bg-card pl-9 pr-3 text-sm" placeholder="নাম / পাসপোর্ট / মোবাইল / রেফারেন্স দিয়ে পরীক্ষার্থী খুঁজুন (পুরাতন কাজসহ)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {s && (
        <section className="rounded-2xl border bg-card p-3 shadow-sm">
          {hits.length === 0 ? <p className="py-2 text-center text-sm text-muted-foreground">কিছু পাওয়া যায়নি।</p> : (
            <ul className="divide-y">
              {hits.map((w) => (
                <li key={w.id} className="flex items-center gap-3 py-2">
                  <CandidatePhoto path={w.candidate_photo_path} name={w.candidate_name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{w.candidate_name} <span className="text-xs text-muted-foreground">#{w.ref_code}</span></div>
                    <div className="truncate text-xs text-muted-foreground">{w.passport_no} · {w.mobile} · {w.occupation_id ? occ(w.occupation_id) : "—"} · {w.svp_result ?? w.status}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/my-works" search={{ tab: "all" }} className="mt-2 block text-center text-xs text-primary">সব কাজে দেখুন →</Link>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link to="/submit-job" className="flex items-center justify-center gap-2 rounded-2xl bg-primary p-3 font-semibold text-primary-foreground shadow-sm">
          <FilePlus2 className="h-5 w-5" /> Submit Work
        </Link>
        <Link to="/result-check" className="flex items-center justify-center gap-2 rounded-2xl border border-primary bg-card p-3 font-semibold text-primary shadow-sm">
          <Search className="h-5 w-5" /> রেজাল্ট চেক
        </Link>
        <OfficeAddress />
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Bell className="h-4 w-4 text-primary" /> পরীক্ষার রিমাইন্ডার</h2>

        <div className="mb-3 flex gap-2 overflow-x-auto">
          {DAYS.map(([n, l]) => (
            <button key={n} onClick={() => setDay(n)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${day === n ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              {l} ({bn(onDay(n).length)})
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">এই দিনে কোনো পরীক্ষা নেই।</p>
        ) : (
          <div className="space-y-2">
            {byOcc.map(([name, items]) => (
              <details key={name} open className="rounded-xl border bg-muted/30">
                <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold">
                  <span>{name}</span><span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{bn(items.length)}</span>
                </summary>
                <ul className="divide-y px-3">
                  {items.map((w) => (
                    <li key={w.id} className="flex items-center gap-3 py-2.5">
                      <CandidatePhoto path={w.candidate_photo_path} name={w.candidate_name} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{w.candidate_name} <span className="text-xs font-normal text-muted-foreground">#{w.ref_code}</span></div>
                        <div className="truncate text-xs text-muted-foreground">{w.passport_no} · {w.mobile}</div>
                      </div>
                      <div className="text-right text-sm font-semibold">{fmtT(w.exam_at)}</div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {cards.map((c) => (
          <Link key={c.label} to="/my-works" search={{ tab: c.tab }} className="rounded-xl border bg-card p-2 text-center shadow-sm hover:bg-muted">
            <c.icon className="mx-auto h-3.5 w-3.5 text-primary" />
            <div className="mt-1 text-base font-bold leading-tight">{bn(c.value)}</div>
            <div className="text-[11px] leading-tight text-muted-foreground">{c.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
