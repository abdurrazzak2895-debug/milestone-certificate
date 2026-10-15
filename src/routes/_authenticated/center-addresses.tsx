import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MapPin, Plus, Send, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { worksQ } from "@/lib/works";
import { ttcQ, occQ } from "@/lib/data";
import { listAccounts } from "@/lib/accounts.functions";
import { DEFAULT_TEMPLATE, PLACEHOLDERS, renderMessage, type MsgCtx } from "@/lib/messaging";
import { sendTestSms } from "@/lib/messaging.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/center-addresses")({
  head: () => ({
    meta: [
      { title: "কেন্দ্রের ঠিকানা ব্যবস্থাপনা — অ্যাডমিন | Milestone Certificate Institute" },
      { name: "description", content: "পরীক্ষা কেন্দ্রের ঠিকানা যোগ ও সম্পাদনা এবং মেসেজ এডিট, প্রিভিউ ও টেস্ট SMS।" },
      { property: "og:title", content: "কেন্দ্রের ঠিকানা ব্যবস্থাপনা — অ্যাডমিন | Milestone Certificate Institute" },
      { property: "og:description", content: "পরীক্ষা কেন্দ্রের ঠিকানা যোগ ও সম্পাদনা এবং মেসেজ এডিট, প্রিভিউ ও টেস্ট SMS।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CenterAddresses,
});

type Ttc = { id: string; name: string; district: string | null; address: string | null; active: boolean; sort_order: number };

const SUGGESTED = ["বগুড়া", "পাবনা", "খুলনা", "গাজীপুর", "রাজশাহী"];

function CenterAddresses() {
  const qc = useQueryClient();
  const ttcs = (useQuery(ttcQ).data ?? []) as Ttc[];
  const [ed, setEd] = useState<{ id: string; name: string; district: string; address: string; sort_order: number } | null>(null);

  const save = async () => {
    if (!ed || !ed.name.trim()) return toast.error("কেন্দ্রের নাম দিন");
    const row = { name: ed.name.trim(), district: ed.district.trim() || null, address: ed.address.trim() || null, sort_order: ed.sort_order };
    const { error } = ed.id
      ? await supabase.from("ttc_centers").update(row).eq("id", ed.id)
      : await supabase.from("ttc_centers").insert({ ...row, active: true });
    if (error) return toast.error("সংরক্ষণ করা যায়নি");
    setEd(null);
    qc.invalidateQueries({ queryKey: ["ttc"] });
    toast.success("কেন্দ্র সংরক্ষিত");
  };

  const toggle = async (t: Ttc) => {
    const { error } = await supabase.from("ttc_centers").update({ active: !t.active }).eq("id", t.id);
    if (error) return toast.error("পরিবর্তন করা যায়নি");
    qc.invalidateQueries({ queryKey: ["ttc"] });
  };

  const missing = SUGGESTED.filter((d) => !ttcs.some((t) => (t.district ?? t.name).includes(d)));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="flex items-center gap-2 text-xl font-bold"><MapPin className="h-5 w-5 text-primary" /> কেন্দ্রের ঠিকানা ব্যবস্থাপনা</h1>

      {missing.length > 0 && (
        <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-sm">
          <span className="text-muted-foreground">এই কেন্দ্রগুলো এখনো যোগ হয়নি: </span>
          {missing.map((d) => (
            <Button key={d} size="sm" variant="outline" className="ml-1" onClick={() => setEd({ id: "", name: d, district: d, address: "", sort_order: ttcs.length + 1 })}>
              <Plus className="mr-1 h-3 w-3" /> {d}
            </Button>
          ))}
        </div>
      )}

      <Button size="sm" onClick={() => setEd({ id: "", name: "", district: "", address: "", sort_order: ttcs.length + 1 })}><Plus className="mr-1 h-4 w-4" /> নতুন কেন্দ্র</Button>

      {ed && (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>কেন্দ্রের নাম</Label><Input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></div>
            <div><Label>জেলা</Label><Input value={ed.district} onChange={(e) => setEd({ ...ed, district: e.target.value })} /></div>
            <div><Label>ক্রম</Label><Input type="number" value={ed.sort_order} onChange={(e) => setEd({ ...ed, sort_order: Number(e.target.value) || 0 })} /></div>
          </div>
          <div><Label>পূর্ণ ঠিকানা (SMS-এ {"{address}"} হিসেবে যাবে)</Label><Textarea rows={3} value={ed.address} onChange={(e) => setEd({ ...ed, address: e.target.value })} placeholder="যেমন: একাডেমিক ভবন, তৃতীয় তলা, রুম নং ৩০৮, বগুড়া" /></div>
          <div className="flex gap-2"><Button size="sm" onClick={save}>সংরক্ষণ</Button><Button size="sm" variant="outline" onClick={() => setEd(null)}>বাতিল</Button></div>
        </div>
      )}

      <ul className="divide-y rounded-xl border bg-card">
        {ttcs.length === 0 && <li className="p-4 text-sm text-muted-foreground">কোনো কেন্দ্র নেই।</li>}
        {ttcs.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div className="min-w-0">
              <div className="font-medium">{t.name} {t.district ? <span className="text-xs text-muted-foreground">({t.district})</span> : null}</div>
              <div className="text-xs text-muted-foreground">{t.address || "ঠিকানা দেওয়া হয়নি"}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEd({ id: t.id, name: t.name, district: t.district ?? "", address: t.address ?? "", sort_order: t.sort_order })}><Pencil className="mr-1 h-3 w-3" /> এডিট</Button>
              <Button size="sm" variant={t.active ? "destructive" : "default"} onClick={() => toggle(t)}>{t.active ? "বন্ধ" : "চালু"}</Button>
            </div>
          </li>
        ))}
      </ul>

      <MessagePreview ttcs={ttcs} />
    </div>
  );
}

function MessagePreview({ ttcs }: { ttcs: Ttc[] }) {
  const occs = useQuery(occQ).data ?? [];
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => listAccounts() }).data ?? [];
  const { data: works = [] } = useQuery(worksQ);
  const [body, setBody] = useState(DEFAULT_TEMPLATE);
  const [ttcId, setTtcId] = useState("");
  const [sending, setSending] = useState(false);

  const ctx: MsgCtx = useMemo(() => ({
    ttc: new Map(ttcs.map((t) => [t.id, { name: t.name, address: t.address }])),
    occ: new Map(occs.map((o) => [o.id, o.name])),
    agents: new Map(accounts.map((a) => [a.id, { name: a.name, mobile: a.mobile }])),
  }), [ttcs, occs, accounts]);

  const sample = works.find((w) => w.status === "approved" && (!ttcId || w.ttc_id === ttcId)) ?? works.find((w) => w.status === "approved");
  const rendered = sample ? renderMessage(body, sample, ctx) : null;

  const test = async () => {
    if (!rendered || rendered.missing.length) return toast.error("প্রিভিউতে তথ্য missing — আগে ঠিকানা/তথ্য পূরণ করুন");
    setSending(true);
    try {
      await sendTestSms({ data: { body: rendered.text } });
      toast.success("টেস্ট SMS পাঠানো হয়েছে");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "পাঠানো যায়নি");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">মেসেজ এডিট ও প্রিভিউ</h2>
      <div>
        <Label>প্রিভিউর কেন্দ্র</Label>
        <select className="h-10 w-full rounded-lg border bg-card px-2 text-sm" value={ttcId} onChange={(e) => setTtcId(e.target.value)}>
          <option value="">যেকোনো কেন্দ্র</option>
          {ttcs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="text-xs text-muted-foreground">{PLACEHOLDERS.map(([k, l]) => `${k} = ${l}`).join(" · ")}</p>
      {rendered ? (
        <>
          <pre className="whitespace-pre-wrap rounded-xl border bg-muted/30 p-3 text-sm">{rendered.text}</pre>
          {rendered.missing.length > 0 && <p className="text-xs text-destructive">তথ্য missing: {rendered.missing.join(", ")}</p>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">প্রিভিউর জন্য অনুমোদিত কোনো কাজ পাওয়া যায়নি।</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm" disabled={sending} onClick={test}><Send className="mr-1 h-4 w-4" /> {sending ? "পাঠানো হচ্ছে…" : "নিজের নম্বরে টেস্ট SMS"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">বাল্ক SMS পাঠানোর আগে নিজের নম্বরে টেস্ট করে মেসেজ ঠিক আছে কিনা দেখে নিন। টেস্ট মেসেজ রিপোর্টে “টেস্ট (নিজের নম্বর)” হিসেবে দেখাবে।</p>
    </div>
  );
}
