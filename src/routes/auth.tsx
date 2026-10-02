import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import campusImage from "@/assets/login-campus.jpg";
import trainingImage from "@/assets/login-training.jpg";
import graduatesImage from "@/assets/login-graduates.jpg";

const slides = [campusImage, trainingImage, graduatesImage];
const mobileSchema = z.string().regex(/^01[3-9]\d{8}$/);
const otpSchema = z.string().regex(/^\d{6}$/);

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "মোবাইল লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { name: "description", content: "মোবাইল নম্বর ও OTP দিয়ে পরীক্ষা ব্যবস্থাপনা পোর্টালে প্রবেশ করুন।" },
      { property: "og:title", content: "মোবাইল লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { property: "og:description", content: "মোবাইল নম্বর ও OTP দিয়ে নিরাপদে প্রবেশ করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const formattedPhone = `+88${mobile}`;

  const sendOtp = async () => {
    if (!mobileSchema.safeParse(mobile).success) {
      toast.error("সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
    setBusy(false);
    if (error) {
      toast.error("OTP পাঠানো যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।");
      return;
    }

    setOtp("");
    setStep("otp");
    setResendIn(60);
    toast.success("আপনার মোবাইলে OTP পাঠানো হয়েছে");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step === "phone") {
      await sendOtp();
      return;
    }

    if (!otpSchema.safeParse(otp).success) {
      toast.error("৬ সংখ্যার OTP দিন");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: formattedPhone, token: otp, type: "sms" });
    setBusy(false);
    if (error) {
      toast.error("OTP সঠিক নয় বা মেয়াদ শেষ হয়েছে");
      return;
    }

    toast.success("সফলভাবে লগইন হয়েছে");
    navigate({ to: "/dashboard", replace: true });
  };

  const changeNumber = () => {
    setStep("phone");
    setOtp("");
    setResendIn(0);
  };

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      <div className="absolute inset-0 -z-20 bg-foreground" aria-hidden="true">
        {slides.map((image, index) => (
          <img
            key={image}
            src={image}
            alt=""
            width={1920}
            height={1088}
            loading={index === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 motion-reduce:transition-none ${index === slide ? "opacity-100" : "opacity-0"}`}
          />
        ))}
      </div>
      <div className="absolute inset-0 -z-10 bg-foreground/65" aria-hidden="true" />

      <section className="w-full max-w-md">
        <div className="mb-5 text-center text-primary-foreground drop-shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-foreground/25 bg-primary/90 font-display text-2xl font-bold shadow-lg">প</div>
          <p className="font-display text-lg font-semibold">পরীক্ষার্থী ও পরীক্ষা ব্যবস্থাপনা</p>
        </div>

        <form onSubmit={submit} className="rounded-lg border border-primary-foreground/20 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          {step === "phone" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6 duration-300">
              <div>
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary"><Phone className="h-5 w-5" /></div>
                <h1 className="text-2xl font-bold">মোবাইল দিয়ে লগইন</h1>
                <p className="mt-1 text-sm text-muted-foreground">আপনার মোবাইল নম্বরে একটি OTP পাঠানো হবে</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="mobile" className="text-sm font-semibold">মোবাইল নম্বর</label>
                <div className="flex overflow-hidden rounded-md border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
                  <div className="flex h-12 shrink-0 items-center border-r border-input bg-muted px-4 font-semibold text-foreground" aria-label="স্থির দেশ কোড">+88</div>
                  <Input
                    id="mobile"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="01XXXXXXXXX"
                    maxLength={11}
                    required
                    aria-describedby="mobile-help"
                    className="h-12 rounded-none border-0 bg-background text-base shadow-none focus-visible:ring-0"
                  />
                </div>
                <p id="mobile-help" className="text-xs text-muted-foreground">১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন</p>
              </div>

              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy || mobile.length !== 11}>
                {busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
                {busy ? "OTP পাঠানো হচ্ছে..." : "OTP পাঠান"}
              </Button>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-3 space-y-6 duration-300">
              <div>
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary"><LockKeyhole className="h-5 w-5" /></div>
                <h1 className="text-2xl font-bold">OTP যাচাই করুন</h1>
                <p className="mt-1 text-sm text-muted-foreground"><span dir="ltr" className="font-medium text-foreground">{formattedPhone}</span> নম্বরে পাঠানো ৬ সংখ্যার কোডটি লিখুন</p>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-semibold">OTP কোড</label>
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={(value) => setOtp(value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  containerClassName="w-full justify-between gap-2"
                  aria-label="৬ সংখ্যার OTP"
                >
                  <InputOTPGroup className="w-full justify-between gap-2">
                    {[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot key={index} index={index} className="h-12 min-w-0 flex-1 rounded-md border bg-background text-lg font-semibold first:rounded-md first:border-l last:rounded-md" />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy || otp.length !== 6}>
                {busy ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
                {busy ? "যাচাই হচ্ছে..." : "যাচাই করে লগইন"}
              </Button>

              <div className="flex items-center justify-between gap-3 text-sm">
                <Button type="button" variant="ghost" size="sm" onClick={changeNumber} className="px-2 text-muted-foreground">
                  <ArrowLeft /> নম্বর পরিবর্তন
                </Button>
                <Button type="button" variant="link" size="sm" onClick={sendOtp} disabled={busy || resendIn > 0} className="px-2">
                  {resendIn > 0 ? `আবার পাঠান (${resendIn})` : "OTP আবার পাঠান"}
                </Button>
              </div>
            </div>
          )}
        </form>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-primary-foreground/80">
          <LockKeyhole className="h-3.5 w-3.5" /> আপনার তথ্য নিরাপদ ও সুরক্ষিত
        </p>
      </section>
    </main>
  );
}
