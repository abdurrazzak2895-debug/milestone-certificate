import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendPhoneOtp, verifyPhoneOtp } from "@/lib/phone-otp.functions";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import space1 from "@/assets/space-1.jpg";
import space2 from "@/assets/space-2.jpg";
import space3 from "@/assets/space-3.jpg";

const slides = [space1, space2, space3];
const mobileSchema = z.string().regex(/^01[3-9]\d{8}$/);
const otpSchema = z.string().regex(/^\d{6}$/);

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "মোবাইল লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { name: "description", content: "মোবাইল নম্বর ও ওটিপি দিয়ে পরীক্ষা ব্যবস্থাপনা পোর্টালে প্রবেশ করুন।" },
      { property: "og:title", content: "মোবাইল লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { property: "og:description", content: "মোবাইল নম্বর ও ওটিপি দিয়ে নিরাপদে প্রবেশ করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const sendFn = useServerFn(sendPhoneOtp);
  const verifyFn = useServerFn(verifyPhoneOtp);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slides.length), 7000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const sendOtp = async () => {
    if (!mobileSchema.safeParse(mobile).success) {
      toast.error("সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন");
      return;
    }

    setBusy(true);
    const res = await sendFn({ data: { mobile } }).catch(() => ({ ok: false as const, reason: "sms_failed" as const }));
    setBusy(false);
    if (!res.ok) {
      toast.error(res.reason === "cooldown" ? "এক মিনিট পর আবার চেষ্টা করুন" : "ওটিপি পাঠানো যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।");
      return;
    }

    setOtp("");
    setStep("otp");
    setResendIn(60);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step === "phone") {
      await sendOtp();
      return;
    }

    if (!otpSchema.safeParse(otp).success) {
      toast.error("৬ সংখ্যার ওটিপি লিখুন");
      return;
    }

    setBusy(true);
    const res = await verifyFn({ data: { mobile, code: otp } }).catch(() => ({ ok: false as const, reason: "server" as const }));
    if (!res.ok) {
      setBusy(false);
      const msg = {
        invalid: "ভুল ওটিপি। অনুগ্রহ করে আবার চেষ্টা করুন।",
        expired: "ওটিপি-এর মেয়াদ শেষ, আবার পাঠান",
        too_many: "অনেকবার ভুল হয়েছে, নতুন ওটিপি নিন",
        server: "লগইন করা যায়নি, আবার চেষ্টা করুন",
      }[res.reason];
      toast.error(msg);
      return;
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: res.tokenHash, type: "magiclink" });
    setBusy(false);
    if (error) {
      toast.error("লগইন করা যায়নি, আবার চেষ্টা করুন");
      return;
    }

    toast.success("সফলভাবে লগইন হয়েছে");
    navigate({ to: "/dashboard", replace: true });
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
          {step === "phone" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 space-y-8 duration-500">
              <h1 className="text-center text-xl font-semibold leading-relaxed text-white">
                অনুগ্রহপূর্বক মোবাইল নাম্বার দিয়ে ভেরিফাই করুন
              </h1>

              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={mobile}
                onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 11))}
                maxLength={11}
                required
                aria-label="মোবাইল নাম্বার"
                className="h-14 w-full rounded-xl border border-white/15 bg-white/5 text-center text-lg tracking-[0.3em] text-white outline-none transition-all duration-300 focus:border-indigo-400/60 focus:bg-white/10 focus:shadow-[0_0_30px_-8px_rgba(129,140,248,0.6)]"
              />

              <button
                type="submit"
                disabled={busy || mobile.length !== 11}
                className="h-13 w-full rounded-xl bg-indigo-500/90 py-3.5 text-base font-semibold text-white transition-all duration-300 hover:bg-indigo-400 hover:shadow-[0_0_35px_-8px_rgba(129,140,248,0.9)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "অপেক্ষা করুন..." : "ওটিপি পাঠান"}
              </button>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-3 space-y-8 duration-500">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={(value) => setOtp(value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoComplete="one-time-code"
                containerClassName="w-full justify-between gap-2"
                aria-label="ওটিপি"
              >
                <InputOTPGroup className="w-full justify-between gap-2">
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="h-13 min-w-0 flex-1 rounded-xl border-white/15 bg-white/5 text-lg font-semibold text-white first:rounded-xl first:border-l last:rounded-xl"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>

              <button
                type="submit"
                disabled={busy || otp.length !== 6}
                className="w-full rounded-xl bg-indigo-500/90 py-3.5 text-base font-semibold text-white transition-all duration-300 hover:bg-indigo-400 hover:shadow-[0_0_35px_-8px_rgba(129,140,248,0.9)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "অপেক্ষা করুন..." : "ভেরিফাই করুন"}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={busy || resendIn > 0}
                  className="text-sm text-indigo-300 transition-colors duration-300 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  পুনরায় ওটিপি পাঠান
                </button>
              </div>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
