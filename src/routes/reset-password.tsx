import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "নতুন পাসওয়ার্ড — পরীক্ষা ব্যবস্থাপনা | Milestone Certificate" },
      { name: "description", content: "অ্যাডমিন অ্যাকাউন্টের নতুন পাসওয়ার্ড সেট করুন।" },
      { property: "og:title", content: "নতুন পাসওয়ার্ড — পরীক্ষা ব্যবস্থাপনা | Milestone Certificate" },
      { property: "og:description", content: "অ্যাডমিন অ্যাকাউন্টের নতুন পাসওয়ার্ড সেট করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error("পাসওয়ার্ড পরিবর্তন করা যায়নি");
    toast.success("পাসওয়ার্ড পরিবর্তন হয়েছে");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={save} className="w-full max-w-sm space-y-4 rounded-3xl border bg-card p-7 shadow-sm">
        <h1 className="text-center text-xl font-semibold">নতুন পাসওয়ার্ড</h1>
        <input type="password" aria-label="নতুন পাসওয়ার্ড" placeholder="নতুন পাসওয়ার্ড" className="h-12 w-full rounded-xl border bg-background px-4" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={busy} className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">সংরক্ষণ করুন</button>
      </form>
    </main>
  );
}
