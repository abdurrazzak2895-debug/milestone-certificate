import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { worksQ, fmtDhakaDateTime, type Work } from "@/lib/works";
import { occQ, ttcQ, lookup, bn } from "@/lib/data";
import { SvpPill } from "@/components/app/WorkBits";
import { ResultCheckButton } from "@/components/app/ResultCheckButton";
import { Button } from "@/components/ui/button";
import brandLogo from "@/assets/brand-logo.png.asset.json";

const dhakaDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

type Info = { name: string; passport: string; occupation: string; ttc: string; examAt: string; result: string; ref: string };

function loadImg(src: string) {
  return new Promise<HTMLImageElement | null>((res) => {
    const i = new Image(); i.crossOrigin = "anonymous";
    i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
  });
}

async function makeCard(d: Info): Promise<Blob> {
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const pass = d.result === "PASS";
  const accent = pass ? "#16a34a" : "#dc2626";
  x.fillStyle = "#f8faf7"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#14532d"; x.fillRect(0, 0, W, 230);
  const logo = await loadImg(brandLogo.url);
  if (logo) { x.save(); x.beginPath(); x.arc(130, 115, 75, 0, Math.PI * 2); x.clip(); x.drawImage(logo, 55, 40, 150, 150); x.restore(); }
  x.fillStyle = "#ffffff"; x.font = "bold 52px sans-serif"; x.fillText("Milestone Certificate", 235, 105);
  x.font = "34px sans-serif"; x.fillText("Institute · SVP Exam Result", 235, 160);
  x.fillStyle = accent; x.beginPath(); x.roundRect(90, 290, W - 180, 200, 30); x.fill();
  x.fillStyle = "#ffffff"; x.textAlign = "center"; x.font = "bold 120px sans-serif"; x.fillText(d.result, W / 2, 435);
  x.textAlign = "left";
  const rows: [string, string][] = [["Name", d.name], ["Passport", d.passport], ["Occupation", d.occupation], ["TTC", d.ttc], ["Exam", d.examAt], ["Reference", d.ref]];
  let y = 600;
  for (const [k, v] of rows) {
    x.fillStyle = "#6b7280"; x.font = "32px sans-serif"; x.fillText(k, 110, y);
    x.fillStyle = "#111827"; x.font = "bold 40px sans-serif";
    let t = v || "—"; while (x.measureText(t).width > 560 && t.length > 3) t = t.slice(0, -2);
    x.fillText(t, 400, y);
    x.strokeStyle = "#e5e7eb"; x.lineWidth = 2; x.beginPath(); x.moveTo(110, y + 30); x.lineTo(W - 110, y + 30); x.stroke();
    y += 105;
  }
  x.fillStyle = "#6b7280"; x.font = "28px sans-serif"; x.textAlign = "center";
  x.fillText("Source: Official SVP (svp-international.pacc.sa)", W / 2, H - 90);
  x.fillText(`Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}`, W / 2, H - 45);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
}

function msgText(d: Info) {
  return `*SVP Exam Result: ${d.result}*\nName: ${d.name}\nPassport: ${d.passport}\nOccupation: ${d.occupation}\nTTC: ${d.ttc}\nExam: ${d.examAt}\n— Milestone Certificate Institute`;
}

export function ResultListShare() {
  const { data: all = [] } = useQuery(worksQ);
  const { data: occ } = useQuery(occQ);
  const { data: ttc } = useQuery(ttcQ);
  const occName = lookup(occ), ttcName = lookup(ttc);
  const [date, setDate] = useState(today);
  const [q, setQ] = useState("");
  const s = q.trim().toUpperCase();
  const list = all
    .filter((w) => w.status === "approved" && !!w.exam_at)
    .filter((w) => (date ? dhakaDay(w.exam_at) === date : true))
    .filter((w) => !s || w.passport_no.toUpperCase().includes(s) || w.candidate_name.toUpperCase().includes(s))
    .sort((a, b) => a.exam_at.localeCompare(b.exam_at));

  const info = (w: Work): Info => ({ name: w.candidate_name, passport: w.passport_no, occupation: occName(w.occupation_id) ?? "—", ttc: ttcName(w.ttc_id) ?? "—", examAt: fmtDhakaDateTime(w.exam_at), result: w.svp_result, ref: w.ref_code });

  const download = async (w: Work) => {
    const d = info(w), blob = await makeCard(d);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `Result-${d.passport}-${d.result}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast.success("ছবি ডাউনলোড হয়েছে");
  };
  const share = async (w: Work) => {
    const d = info(w), blob = await makeCard(d);
    const file = new File([blob], `Result-${d.passport}.png`, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (x: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], text: msgText(d) }); return; } catch { return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msgText(d))}`, "_blank");
  };

  const shift = (n: number) => { const d = new Date(`${date || today()}T00:00:00`); d.setDate(d.getDate() + n); setDate(d.toLocaleDateString("en-CA")); };

  return (
    <div className="card-surface space-y-3 p-4">
      <h2 className="text-lg font-bold">পরীক্ষার্থীদের তালিকা</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => shift(-1)}>‹</Button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border bg-card px-2 text-sm" />
        <Button size="sm" variant="outline" onClick={() => shift(1)}>›</Button>
        <Button size="sm" variant="ghost" onClick={() => setDate(today())}>আজ</Button>
        <Button size="sm" variant="ghost" onClick={() => setDate("")}>সব তারিখ</Button>
      </div>
      <input className="h-10 w-full rounded-lg border bg-card px-3 text-sm" placeholder="পাসপোর্ট / নাম দিয়ে খুঁজুন" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="text-xs text-muted-foreground">মোট {bn(list.length)} জন</p>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {list.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">এই তারিখে কোনো পরীক্ষার্থী নেই।</p>}
        {list.map((w) => {
          const done = w.svp_result === "PASS" || w.svp_result === "FAIL";
          return (
            <div key={w.id} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-semibold">{w.candidate_name}</p><p className="text-xs text-muted-foreground">{w.passport_no} · {occName(w.occupation_id) ?? "—"}</p><p className="text-xs text-muted-foreground">{fmtDhakaDateTime(w.exam_at)}</p></div>
                <SvpPill result={w.svp_result} work={w} />
              </div>
              <div className="flex flex-wrap gap-2">
                <ResultCheckButton w={w} />
                {done && <>
                  <Button size="sm" variant="outline" onClick={() => download(w)}><Download className="mr-1 h-4 w-4" />ছবি ডাউনলোড</Button>
                  <Button size="sm" onClick={() => share(w)}><Share2 className="mr-1 h-4 w-4" />WhatsApp</Button>
                </>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
