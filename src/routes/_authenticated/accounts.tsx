import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, KeyRound, Trash2 } from "lucide-react";
import { listAccounts, createAccount, resetAccountPassword, setAccountActive, deleteAccount } from "@/lib/accounts.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "কর্মীদের অ্যাকাউন্ট — অ্যাডমিন" },
      { name: "description", content: "এজেন্ট, সার্ভিস প্রোভাইডার ও রিসেপশন কর্মীদের অ্যাকাউন্ট পরিচালনা।" },
      { property: "og:title", content: "কর্মীদের অ্যাকাউন্ট — অ্যাডমিন" },
      { property: "og:description", content: "এজেন্ট, সার্ভিস প্রোভাইডার ও রিসেপশন কর্মীদের অ্যাকাউন্ট পরিচালনা।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Accounts,
});

const ROLE_LABEL: Record<string, string> = { agent: "এজেন্ট", service_provider: "সার্ভিস প্রোভাইডার", management: "রিসেপশন", reception_agent: "রিসেপশন + এজেন্ট" };

function Accounts() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["accounts"], queryFn: () => listAccounts() });
  const [f, setF] = useState({ name: "", mobile: "", password: "", agent_code: "", role: "agent" as "agent" | "service_provider" | "management" | "reception_agent" });
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return toast.error("নাম দিন");
    if (!/^01[3-9]\d{8}$/.test(f.mobile)) return toast.error("১১ সংখ্যার সঠিক মোবাইল নম্বর দিন");
    if (f.password.length < 6) return toast.error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
    setBusy(true);
    try {
      const r = await createAccount({ data: f });
      if (!r.ok) return toast.error(r.message);
      toast.success("অ্যাকাউন্ট তৈরি হয়েছে");
      setF({ name: "", mobile: "", password: "", agent_code: "", role: f.role });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } catch {
      toast.error("অ্যাকাউন্ট তৈরি করা যায়নি");
    } finally {
      setBusy(false);
    }
  };

  const reset = async (id: string) => {
    const pw = window.prompt("নতুন পাসওয়ার্ড দিন (কমপক্ষে ৬ অক্ষর)");
    if (!pw) return;
    if (pw.length < 6) return toast.error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
    const r = await resetAccountPassword({ data: { id, password: pw } }).catch(() => ({ ok: false }));
    r.ok ? toast.success("পাসওয়ার্ড পরিবর্তন হয়েছে") : toast.error("পাসওয়ার্ড পরিবর্তন করা যায়নি");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">কর্মীদের অ্যাকাউন্ট</h1>

      <form onSubmit={create} className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold"><UserPlus className="h-5 w-5 text-primary" /> নতুন অ্যাকাউন্ট যোগ করুন</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["agent", "service_provider", "management", "reception_agent"] as const).map((r) => (
            <button type="button" key={r} onClick={() => setF({ ...f, role: r })}
              className={`rounded-xl border px-3 py-2.5 text-sm ${f.role === r ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>নাম</Label><Input value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>মোবাইল নম্বর</Label><Input inputMode="numeric" placeholder="01XXXXXXXXX" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, "").slice(0, 11) })} /></div>
           <div><Label>{f.role === "agent" ? "Agent ID" : f.role === "service_provider" ? "Provider ID" : "Reception ID"}</Label><Input value={f.agent_code} maxLength={30} placeholder="যেমন: MG-001" onChange={(e) => setF({ ...f, agent_code: e.target.value.replace(/[^A-Za-z0-9-]/g, "") })} /></div>
          <div><Label>পাসওয়ার্ড</Label><Input value={f.password} maxLength={72} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        </div>
        <Button type="submit" disabled={busy}>{busy ? "তৈরি হচ্ছে..." : "অ্যাকাউন্ট তৈরি করুন"}</Button>
      </form>

      <section className="rounded-2xl border bg-card shadow-sm">
        {q.isLoading ? <p className="p-5 text-sm text-muted-foreground">লোড হচ্ছে...</p>
          : q.error ? <p className="p-5 text-sm text-destructive">শুধু অ্যাডমিন এই তালিকা দেখতে পারবেন।</p>
          : !q.data?.length ? <p className="p-5 text-sm text-muted-foreground">এখনো কোনো অ্যাকাউন্ট নেই।</p>
          : (
            <ul className="divide-y">
              {q.data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{a.name || "—"}</div>
                    <div className="text-sm text-muted-foreground">{a.agent_code ? `${a.agent_code} · ` : ""}{a.mobile} · {ROLE_LABEL[a.role] ?? a.role} · <span className={a.active ? "text-primary" : "text-destructive"}>{a.active ? "Active" : "Inactive"}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={async () => { const r = await setAccountActive({ data: { id: a.id, active: !a.active } }).catch(() => ({ ok: false })); r.ok ? qc.invalidateQueries({ queryKey: ["accounts"] }) : toast.error("পরিবর্তন করা যায়নি"); }}>{a.active ? "Inactive করুন" : "Active করুন"}</Button><Button variant="outline" size="sm" onClick={() => reset(a.id)}><KeyRound className="mr-1 h-4 w-4" /> পাসওয়ার্ড</Button><Button variant="destructive" size="sm" onClick={async () => { if (!window.confirm(`${a.name} অ্যাকাউন্টটি স্থায়ীভাবে ডিলিট করবেন?`)) return; const r = await deleteAccount({ data: { id: a.id } }).catch(() => ({ ok: false })); if (r.ok) { toast.success("অ্যাকাউন্ট ডিলিট হয়েছে"); qc.invalidateQueries({ queryKey: ["accounts"] }); } else toast.error("ডিলিট করা যায়নি"); }}><Trash2 className="mr-1 h-4 w-4" /> ডিলিট</Button></div>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
