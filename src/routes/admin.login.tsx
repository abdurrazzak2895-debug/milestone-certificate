import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import space1 from "@/assets/space-1.jpg";
import space2 from "@/assets/space-2.jpg";
import space3 from "@/assets/space-3.jpg";

const slides = [space1, space2, space3];

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "অ্যাডমিন লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { name: "description", content: "অ্যাডমিন ও স্টাফদের জন্য ইমেইল ও পাসওয়ার্ড দিয়ে নিরাপদ লগইন।" },
      { property: "og:title", content: "অ্যাডমিন লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { property: "og:description", content: "অ্যাডমিন ও স্টাফদের জন্য নিরাপদ লগইন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setSlide((s) => (s + 1) % slides.length), 7000);
    return () => window.clearInterval(t);
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setBusy(false);
      toast.error("ইমেইল বা পাসওয়ার্ড সঠিক নয়");
      return;
    }
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!roles || roles.length === 0) {
      await supabase.auth.signOut();
      setBusy(false);
      toast.error("এই অ্যাকাউন্টের অ্যাডমিন অ্যাক্সেস নেই");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  };

  const forgot = async () => {
    if (!email.trim()) return toast.error("প্রথমে ইমেইল লিখুন");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error("লিংক পাঠানো যায়নি");
    else toast.success("পাসওয়ার্ড রিসেট লিংক ইমেইলে পাঠানো হয়েছে");
  };

  const input =
    "h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-base text-white outline-none transition focus:border-sky-300/60 focus:shadow-[0_0_24px_rgba(125,211,252,0.25)]";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4">
      {slides.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[2000ms] ${i === slide ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-black/60" />
      <form
        onSubmit={login}
        className="relative w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-black/50 p-7 shadow-[0_0_60px_rgba(56,189,248,0.15)] backdrop-blur-xl"
      >
        <h1 className="text-center text-xl font-semibold text-white">অ্যাডমিন লগইন</h1>
        <input className={input} type="email" autoComplete="email" aria-label="ইমেইল" placeholder="ইমেইল" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" autoComplete="current-password" aria-label="পাসওয়ার্ড" placeholder="পাসওয়ার্ড" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button disabled={busy} className="h-12 w-full rounded-xl bg-white font-semibold text-black transition hover:bg-white/90 disabled:opacity-60">
          {busy ? "অপেক্ষা করুন..." : "লগইন করুন"}
        </button>
        <button type="button" onClick={forgot} className="block w-full text-center text-sm text-white/70 hover:text-white">
          পাসওয়ার্ড ভুলে গেছেন?
        </button>
      </form>
    </main>
  );
}
