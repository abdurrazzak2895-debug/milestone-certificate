import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { homeForRoles } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import { checkDeviceSession, claimDeviceSession } from "@/lib/device-session";
import space1 from "@/assets/space-1.webp";
import space2 from "@/assets/space-2.webp";
import space3 from "@/assets/space-3.webp";

const slides = [space1, space2, space3];
const mobileSchema = z.string().regex(/^01[3-9]\d{8}$/);

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { name: "description", content: "মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে পরীক্ষা ব্যবস্থাপনা পোর্টালে প্রবেশ করুন।" },
      { property: "og:title", content: "লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { property: "og:description", content: "মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে নিরাপদে প্রবেশ করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const inputCls =
  "h-14 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-center text-lg text-white outline-none transition-all duration-300 focus:border-indigo-400/60 focus:bg-white/10 focus:shadow-[0_0_30px_-8px_rgba(129,140,248,0.6)]";
const btnCls =
  "w-full rounded-xl bg-indigo-500/90 py-3.5 text-base font-semibold text-white transition-all duration-300 hover:bg-indigo-400 hover:shadow-[0_0_35px_-8px_rgba(129,140,248,0.9)] disabled:cursor-not-allowed disabled:opacity-40";

function AuthPage() {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((c) => (c + 1) % slides.length), 7000);
    return () => window.clearInterval(timer);
  }, []);

  // Show why this device was signed out; auto-enter if still within the 12h device session.
  useEffect(() => {
    const reason = sessionStorage.getItem("logout_reason");
    if (reason) {
      sessionStorage.removeItem("logout_reason");
      toast.error(reason);
    }
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      if (await checkDeviceSession()) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      navigate({ to: homeForRoles((roles ?? []).map((r) => r.role as string)), replace: true });
    })();
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mobileSchema.safeParse(mobile).success) {
      toast.error("সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন");
      return;
    }
    if (!password) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: `88${mobile}@phone.login.local`,
      password,
    });
    if (error || !data.user) {
      setBusy(false);
      toast.error("মোবাইল নম্বর বা পাসওয়ার্ড সঠিক নয়");
      return;
    }
    await claimDeviceSession();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    setBusy(false);
    toast.success("সফলভাবে লগইন হয়েছে");
    navigate({ to: homeForRoles((roles ?? []).map((r) => r.role as string)), replace: true });
  };

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-8 sm:px-6">
      <div className="absolute inset-0 -z-20" aria-hidden="true">
        {slides.map((image, index) => (
          <img
            key={image}
            src={image}
            alt=""
            width={1920}
            height={1088}
            loading={index === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[2500ms] ease-in-out motion-reduce:transition-none ${index === slide ? "opacity-100" : "opacity-0"}`}
          />
        ))}
      </div>
      <div className="absolute inset-0 -z-10 bg-black/45" aria-hidden="true" />

      <section className="w-full max-w-sm">
        <form
          onSubmit={submit}
          className="rounded-3xl border border-white/10 bg-black/55 p-8 shadow-[0_0_80px_-20px_rgba(129,140,248,0.45)] backdrop-blur-2xl sm:p-10"
        >
          <div className="animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-500">
            <h1 className="text-center text-xl font-semibold text-white">লগইন</h1>
            <div className="space-y-2">
              <label htmlFor="mobile" className="block text-sm text-white/70">মোবাইল নম্বর</label>
              <input
                id="mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))}
                maxLength={11}
                required
                className={`${inputCls} tracking-[0.2em]`}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm text-white/70">পাসওয়ার্ড</label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={busy || mobile.length !== 11 || !password} className={btnCls}>
              {busy ? "অপেক্ষা করুন..." : "লগইন"}
            </button>
            <button
              type="button"
              onClick={() => toast.info("পাসওয়ার্ড পুনরুদ্ধারের জন্য অ্যাডমিনের সঙ্গে যোগাযোগ করুন")}
              className="block w-full text-center text-sm text-indigo-300 transition-colors hover:text-indigo-200"
            >
              পাসওয়ার্ড ভুলে গেছেন?
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
