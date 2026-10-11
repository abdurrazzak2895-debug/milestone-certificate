import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

type W = { id: string; candidate_name: string; exam_at: string | null; passport_no?: string | null };

// Keeps asking until the agent turns browser notifications on; then reminds 1 hour before each exam.
export function AgentNotifyPrompt({ works }: { works: W[] }) {
  const [perm, setPerm] = useState<string>("granted");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") { setPerm("unsupported"); return; }
    setPerm(Notification.permission);
  }, []);

  // Re-show the prompt every 2 minutes after closing until enabled
  useEffect(() => {
    if (!hidden) return;
    const t = setTimeout(() => setHidden(false), 120000);
    return () => clearTimeout(t);
  }, [hidden]);

  useEffect(() => {
    if (perm !== "granted") return;
    const check = () => {
      const now = Date.now();
      for (const w of works) {
        if (!w.exam_at) continue;
        const diff = new Date(w.exam_at).getTime() - now;
        if (diff > 0 && diff <= 60 * 60 * 1000) {
          const key = `exam-notified-${w.id}-${w.exam_at}`;
          if (localStorage.getItem(key)) continue;
          localStorage.setItem(key, "1");
          new Notification("⏰ পরীক্ষার রিমাইন্ডার", {
            body: `${w.candidate_name} — ${new Date(w.exam_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} এ পরীক্ষা`,
            icon: "/favicon.png",
          });
        }
      }
    };
    check();
    const i = setInterval(check, 60000);
    return () => clearInterval(i);
  }, [perm, works]);

  if (perm === "granted" || perm === "unsupported" || hidden) return null;

  const enable = async () => {
    const r = await Notification.requestPermission();
    setPerm(r);
    if (r !== "granted") setHidden(true);
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary bg-primary/15 p-3 shadow-sm animate-pulse">
      <BellRing className="h-6 w-6 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">পরীক্ষার রিমাইন্ডার পেতে নোটিফিকেশন চালু করুন</div>
        {perm === "denied" && <div className="text-xs text-muted-foreground">ব্রাউজারের সেটিংস থেকে এই সাইটের Notification "Allow" করুন।</div>}
      </div>
      <button onClick={enable} className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">চালু করুন</button>
      <button onClick={() => setHidden(true)} className="shrink-0 text-xs text-muted-foreground">পরে</button>
    </div>
  );
}
