import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Notif = { id: string; title: string; body: string | null; read: boolean; created_at: string };

function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.36);
  } catch {
    /* ignore */
  }
}

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);
  const { data = [] } = useQuery({
    queryKey: ["notifications", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,read,created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as Notif[];
    },
  });
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`notif-${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        (p) => {
          const n = p.new as Notif;
          beep();
          try {
            navigator.vibrate?.([200, 100, 200]);
          } catch {
            /* ignore */
          }
          toast.success(n.title, { description: n.body ?? undefined });
          try {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(n.title, {
                body: n.body ?? undefined,
                icon: "/favicon.png",
                tag: n.id,
              });
            }
          } catch {
            /* ignore */
          }
          qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, qc]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const unread = data.filter((n) => !n.read).length;
  const markAll = async () => {
    if (!uid) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", uid)
      .eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  return (
    <div ref={ref} className="relative">
      <button
        aria-label="নোটিফিকেশন"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full border bg-card p-2 shadow-sm"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-bold text-destructive-foreground">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-xl border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">নোটিফিকেশন</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-primary">
                সব পড়া হয়েছে
              </button>
            )}
          </div>
          {typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission !== "granted" && (
              <button
                onClick={async () => {
                  const r = await Notification.requestPermission();
                  if (r === "granted") {
                    toast.success("ফোনে নোটিফিকেশন চালু হয়েছে");
                    new Notification("নোটিফিকেশন চালু হয়েছে", { icon: "/favicon.png" });
                  } else toast.error("ব্রাউজার সেটিংস থেকে নোটিফিকেশন অনুমতি দিন");
                  setOpen(false);
                }}
                className="w-full border-b bg-primary/10 px-3 py-2 text-left text-xs font-semibold text-primary"
              >
                🔔 ফোনে নোটিফিকেশন চালু করুন
              </button>
            )}
          <div className="max-h-96 overflow-y-auto">
            {data.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">কোনো নোটিফিকেশন নেই</p>
            )}
            {data.map((n) => (
              <div
                key={n.id}
                className={`border-b px-3 py-2 text-sm ${n.read ? "" : "bg-primary/10"}`}
              >
                <div className="font-medium">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("bn-BD")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
