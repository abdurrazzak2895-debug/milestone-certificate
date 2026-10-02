import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui-bits";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { name: "description", content: "অ্যাডমিন প্যানেলে প্রবেশ করুন।" },
      { property: "og:title", content: "লগইন — পরীক্ষা ব্যবস্থাপনা" },
      { property: "og:description", content: "অ্যাডমিন প্যানেলে প্রবেশ করুন।" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return toast.error("ইমেইল বা পাসওয়ার্ড ভুল");
      navigate({ to: "/dashboard" });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      if (data.session) navigate({ to: "/dashboard" });
      else toast.success("ইমেইলে পাঠানো লিংকে ক্লিক করে অ্যাকাউন্ট নিশ্চিত করুন");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card-surface w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary font-display text-2xl font-bold text-primary-foreground">প</div>
          <h1 className="text-2xl font-bold">{mode === "in" ? "লগইন করুন" : "নতুন অ্যাকাউন্ট"}</h1>
          <p className="text-sm text-muted-foreground">পরীক্ষার্থী ও পরীক্ষা ব্যবস্থাপনা</p>
        </div>
        {mode === "up" && <Field label="নাম"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
        <Field label="ইমেইল"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="পাসওয়ার্ড"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></Field>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "অপেক্ষা করুন..." : mode === "in" ? "লগইন" : "অ্যাকাউন্ট খুলুন"}</Button>
        <button type="button" className="w-full text-sm text-primary" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "অ্যাকাউন্ট নেই? নতুন খুলুন" : "অ্যাকাউন্ট আছে? লগইন করুন"}
        </button>
        <p className="text-center text-xs text-muted-foreground">প্রথম অ্যাকাউন্টটি স্বয়ংক্রিয়ভাবে অ্যাডমিন হবে।</p>
      </form>
    </div>
  );
}
