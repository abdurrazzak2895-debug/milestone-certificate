import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Empty, Field, NativeSelect } from "@/components/app/ui-bits";
import { occQ, ttcQ, settingsQ, remindersQ, candidatesQ, fmtDate, todayStr, useRefreshAll } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "সেটিংস ও অ্যাডমিন" }, { name: "description", content: "টিটিসি, পেশা, ব্যবহারকারী ও সেটিংস।" }, { property: "og:title", content: "সেটিংস ও অ্যাডমিন" }, { property: "og:description", content: "টিটিসি, পেশা, ব্যবহারকারী ও সেটিংস।" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <PageHeader title="সেটিংস ও অ্যাডমিন প্যানেল" />
      <Tabs defaultValue="ttc">
        <TabsList className="mb-4 flex h-auto flex-wrap">
          <TabsTrigger value="ttc">টিটিসি সেন্টার</TabsTrigger>
          <TabsTrigger value="occ">পেশা</TabsTrigger>
          <TabsTrigger value="rem">রিমাইন্ডার</TabsTrigger>
          <TabsTrigger value="users">ব্যবহারকারী</TabsTrigger>
          <TabsTrigger value="gen">সাধারণ</TabsTrigger>
        </TabsList>
        <TabsContent value="ttc"><MasterList table="ttc_centers" withDistrict /></TabsContent>
        <TabsContent value="occ"><MasterList table="occupations" /></TabsContent>
        <TabsContent value="rem"><Reminders /></TabsContent>
        <TabsContent value="users"><Users /></TabsContent>
        <TabsContent value="gen"><General /></TabsContent>
      </Tabs>
    </div>
  );
}

function MasterList({ table, withDistrict }: { table: "ttc_centers" | "occupations"; withDistrict?: boolean }) {
  const { data = [] } = useQuery(table === "ttc_centers" ? ttcQ : occQ);
  const refresh = useRefreshAll();
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    const row = withDistrict ? { name: name.trim(), district: district || null } : { name: name.trim() };
    const { error } = await supabase.from(table).insert(row);
    if (error) return toast.error(error.code === "23505" ? "এই নাম আগেই আছে" : error.message);
    setName(""); setDistrict(""); refresh(); toast.success("যোগ হয়েছে");
  };
  const del = async (id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };
  return (
    <div className="card-surface max-w-2xl p-4">
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="নাম" className="flex-1" />
        {withDistrict && <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="জেলা" className="w-40" />}
        <Button onClick={add}>যোগ করুন</Button>
      </div>
      <ul className="divide-y">
        {data.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2">
            <span>{r.name} {"district" in r && r.district && <span className="text-sm text-muted-foreground">· {r.district as string}</span>}</span>
            <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reminders() {
  const { data = [] } = useQuery(remindersQ);
  const { data: cands = [] } = useQuery(candidatesQ);
  const refresh = useRefreshAll();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr());
  const [cand, setCand] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    const { error } = await supabase.from("reminders").insert({ title, due_date: date, candidate_id: cand || null });
    if (error) return toast.error(error.message);
    setTitle(""); refresh();
  };
  const toggle = async (id: string, done: boolean) => { await supabase.from("reminders").update({ done }).eq("id", id); refresh(); };
  return (
    <div className="card-surface max-w-3xl p-4">
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="যেমন: পুনঃপরীক্ষার তারিখ জানান" className="sm:col-span-2" />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <NativeSelect value={cand} onChange={(e) => setCand(e.target.value)}><option value="">পরীক্ষার্থী (ঐচ্ছিক)</option>{cands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
        <Button onClick={add} className="sm:col-span-4">রিমাইন্ডার যোগ করুন</Button>
      </div>
      {data.length === 0 ? <Empty>কোনো রিমাইন্ডার নেই</Empty> : (
        <ul className="divide-y">
          {data.map((r) => (
            <li key={r.id} className={`flex items-center justify-between py-2 ${r.done ? "opacity-50 line-through" : ""}`}>
              <span>{r.title} <span className="text-sm text-muted-foreground">· {fmtDate(r.due_date)} · {cands.find((c) => c.id === r.candidate_id)?.name ?? ""}</span></span>
              <Button size="sm" variant="outline" onClick={() => toggle(r.id, !r.done)}><Check className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Users() {
  const { data } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const [{ data: p }, { data: r }] = await Promise.all([supabase.from("profiles").select("*"), supabase.from("user_roles").select("*")]);
      return (p ?? []).map((x) => ({ ...x, roles: (r ?? []).filter((y) => y.user_id === x.id).map((y) => y.role) }));
    },
  });
  return (
    <div className="card-surface max-w-2xl p-4">
      <p className="mb-3 text-sm text-muted-foreground">নতুন ব্যবহারকারী লগইন পেজ থেকে অ্যাকাউন্ট খুলতে পারবেন। প্রথম অ্যাকাউন্ট অ্যাডমিন।</p>
      <ul className="divide-y">
        {data?.map((u) => (
          <li key={u.id} className="flex justify-between py-2">
            <span>{u.full_name} <span className="text-sm text-muted-foreground">{u.email}</span></span>
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">{u.roles.includes("admin") ? "অ্যাডমিন" : "স্টাফ"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function General() {
  const { data } = useQuery(settingsQ);
  const refresh = useRefreshAll();
  const [org, setOrg] = useState("");
  const [api, setApi] = useState("");
  useEffect(() => { if (data) { setOrg(data.org_name ?? ""); setApi(data.result_api_url ?? ""); } }, [data]);
  const save = async () => {
    const { error } = await supabase.from("settings").upsert([{ key: "org_name", value: org }, { key: "result_api_url", value: api }]);
    if (error) return toast.error(error.message);
    refresh(); toast.success("সংরক্ষিত হয়েছে");
  };
  return (
    <div className="card-surface max-w-xl space-y-3 p-4">
      <Field label="প্রতিষ্ঠানের নাম"><Input value={org} onChange={(e) => setOrg(e.target.value)} /></Field>
      <Field label="অফিসিয়াল রেজাল্ট API ঠিকানা (ভবিষ্যতে সংযোগের জন্য)"><Input value={api} onChange={(e) => setApi(e.target.value)} placeholder="এখনো সংযুক্ত নয়" /></Field>
      <p className="text-xs text-muted-foreground">অনুমোদিত অফিসিয়াল API পাওয়া গেলে অটোমেটিক রেজাল্ট চেক চালু করা যাবে।</p>
      <Button onClick={save}>সংরক্ষণ করুন</Button>
    </div>
  );
}
