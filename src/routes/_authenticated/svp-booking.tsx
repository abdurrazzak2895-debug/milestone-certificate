import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Mail, Printer, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Empty, Field, NativeSelect } from "@/components/app/ui-bits";
import { DateSelect } from "@/components/app/DateSelect";
import { occQ, ttcQ, fmtDate } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/svp-booking")({
  head: () => ({
    meta: [
      { title: "SVP Takamol বুকিং | Milestone Certificate Institute" },
      { name: "description", content: "Takamol বুকিং তালিকা, Yopmail OTP ইনবক্স ও Choice Slip প্রিন্ট।" },
      { property: "og:title", content: "SVP Takamol বুকিং | Milestone Certificate Institute" },
      { property: "og:description", content: "Takamol বুকিং তালিকা, Yopmail OTP ইনবক্স ও Choice Slip প্রিন্ট।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SvpBooking,
});

const SVP_URL = "https://svp-international.pacc.sa/";
const STATUS: Record<string, string> = { booked: "বুকড", otp_pending: "OTP অপেক্ষমাণ", slip_done: "স্লিপ সংগ্রহ", cancelled: "বাতিল" };
type B = { id: string; candidate_name: string; passport: string; occupation: string | null; center: string | null; exam_date: string | null; exam_time: string | null; agency: string | null; login_email: string | null; status: string; notes: string | null };

const bookingsQ = { queryKey: ["svp_bookings"], queryFn: async () => { const { data, error } = await supabase.from("svp_bookings").select("*").order("exam_date", { ascending: true }); if (error) throw error; return (data ?? []) as B[]; } };

export function yopmailInbox(email: string | null) {
  const m = /^([^@]+)@yopmail\.(com|fr|net)$/i.exec((email ?? "").trim());
  return m ? `https://yopmail.com/?login=${encodeURIComponent(m[1]!)}` : null;
}

const empty = { candidate_name: "", passport: "", occupation: "", center: "", exam_date: "", exam_time: "", agency: "", login_email: "", notes: "" };

function SvpBooking() {
  const qc = useQueryClient();
  const { data = [] } = useQuery(bookingsQ);
  const { data: occ = [] } = useQuery(occQ);
  const { data: ttc = [] } = useQuery(ttcQ);
  const [f, setF] = useState(empty);
  const [q, setQ] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["svp_bookings"] });
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const add = async () => {
    if (!f.candidate_name.trim() || !f.passport.trim()) return toast.error("নাম ও পাসপোর্ট দিন");
    const row = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])) as Record<string, string | null>;
    row["passport"] = f.passport.trim().toUpperCase();
    const { error } = await supabase.from("svp_bookings").insert(row as never);
    if (error) return toast.error(error.message);
    setF(empty); refresh(); toast.success("বুকিং যোগ হয়েছে");
  };
  const upd = async (id: string, status: string) => { await supabase.from("svp_bookings").update({ status }).eq("id", id); refresh(); };
  const del = async (id: string) => { if (!confirm("মুছে ফেলবেন?")) return; await supabase.from("svp_bookings").delete().eq("id", id); refresh(); };

  const list = useMemo(() => { const s = q.trim().toLowerCase(); return s ? data.filter((b) => [b.candidate_name, b.passport, b.occupation, b.agency, b.login_email].some((x) => x?.toLowerCase().includes(s))) : data; }, [data, q]);
  const counts = { total: data.length, otp: data.filter((b) => b.status === "otp_pending").length, done: data.filter((b) => b.status === "slip_done").length };

  return (
    <div className="space-y-4">
      <PageHeader title="SVP Takamol বুকিং" />
      <div className="grid grid-cols-3 gap-2">
        {[["মোট বুকিং", counts.total], ["OTP অপেক্ষমাণ", counts.otp], ["স্লিপ সংগ্রহ", counts.done]].map(([l, n]) => (
          <div key={l} className="card-surface p-3 text-center"><div className="text-2xl font-bold text-primary">{n}</div><div className="text-xs text-muted-foreground">{l}</div></div>
        ))}
      </div>
      <div className="card-surface grid gap-2 p-4 sm:grid-cols-3">
        <Field label="পরীক্ষার্থীর নাম"><Input value={f.candidate_name} onChange={set("candidate_name")} /></Field>
        <Field label="পাসপোর্ট"><Input value={f.passport} onChange={set("passport")} /></Field>
        <Field label="পেশা"><NativeSelect value={f.occupation} onChange={set("occupation")}><option value="">বাছাই করুন</option>{occ.map((o) => <option key={o.id}>{o.name}</option>)}</NativeSelect></Field>
        <Field label="কেন্দ্র"><NativeSelect value={f.center} onChange={set("center")}><option value="">বাছাই করুন</option>{ttc.map((t) => <option key={t.id}>{t.name}</option>)}</NativeSelect></Field>
        <Field label="পরীক্ষার তারিখ"><DateSelect value={f.exam_date} onChange={set("exam_date")} /></Field>
        <Field label="সময়"><Input value={f.exam_time} onChange={set("exam_time")} placeholder="10:00" /></Field>
        <Field label="এজেন্সি"><Input value={f.agency} onChange={set("agency")} /></Field>
        <Field label="SVP লগইন ইমেইল"><Input value={f.login_email} onChange={set("login_email")} placeholder="name@yopmail.com" /></Field>
        <Field label="নোট"><Input value={f.notes} onChange={set("notes")} /></Field>
        <Button className="sm:col-span-3" onClick={add}>বুকিং যোগ করুন</Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="নাম, পাসপোর্ট, পেশা, এজেন্সি বা ইমেইল দিয়ে খুঁজুন" />
      {list.length === 0 ? <Empty>কোনো বুকিং নেই</Empty> : (
        <ul className="space-y-2">
          {list.map((b) => {
            const inbox = yopmailInbox(b.login_email);
            return (
              <li key={b.id} className="card-surface flex flex-wrap items-center gap-2 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{b.candidate_name} <span className="text-muted-foreground">· {b.passport}</span></div>
                  <div className="text-xs text-muted-foreground">{b.occupation ?? "-"} · {b.center ?? "-"} · {b.exam_date ? fmtDate(b.exam_date) : "-"} {b.exam_time ?? ""} · {b.agency ?? ""}</div>
                  {b.login_email && <div className="text-xs">{b.login_email}</div>}
                </div>
                <NativeSelect value={b.status} onChange={(e) => upd(b.id, e.target.value)} className="w-36">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect>
                <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(b.login_email ?? ""); window.open(SVP_URL, "_blank", "noopener"); upd(b.id, "otp_pending"); }}><ExternalLink className="h-4 w-4" /> SVP লগইন</Button>
                {inbox && <Button size="sm" variant="outline" onClick={() => window.open(inbox, "_blank", "noopener")}><Mail className="h-4 w-4" /> OTP ইনবক্স</Button>}
                {b.login_email && <Button size="icon" variant="ghost" onClick={() => { void navigator.clipboard.writeText(b.login_email!); toast.success("ইমেইল কপি হয়েছে"); }}><Copy className="h-4 w-4" /></Button>}
                <Button size="icon" variant="ghost" onClick={() => printSlip(b)}><Printer className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function printSlip(b: B) {
  const w = window.open("", "_blank");
  if (!w) return toast.error("পপআপ চালু করুন");
  const esc = (s: string | null) => (s ?? "-").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const row = (l: string, v: string | null) => `<tr><th>${l}</th><td>${esc(v)}</td></tr>`;
  w.document.write(`<html><head><title>Choice Slip ${esc(b.passport)}</title><style>body{font-family:sans-serif;padding:40px}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #333;padding:10px;text-align:left}th{width:35%;background:#f1f5f1}</style></head><body><h1>Milestone Certificate Institute</h1><h3 style="text-align:center">Takamol Exam Choice Slip</h3><table>${row("Candidate Name", b.candidate_name)}${row("Passport", b.passport)}${row("Occupation", b.occupation)}${row("Exam Center", b.center)}${row("Exam Date", b.exam_date)}${row("Exam Time", b.exam_time)}${row("Agency", b.agency)}</table><p style="margin-top:30px">Please bring original passport and Takamol ticket. Report 1 hour before the exam.</p></body></html>`);
  w.document.close(); w.focus(); w.print();
}
