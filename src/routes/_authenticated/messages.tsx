import { DateSelect } from "@/components/app/DateSelect";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Send, RefreshCw, Ban, Play, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { worksQ } from "@/lib/works";
import { ttcQ, occQ, bn } from "@/lib/data";
import { listAccounts } from "@/lib/accounts.functions";
import {
  DEFAULT_FILTER,
  DEFAULT_TEMPLATE,
  PLACEHOLDERS,
  renderMessage,
  selectRecipients,
  type MsgCtx,
  type MsgFilter,
} from "@/lib/messaging";
import {
  sendMessagesNow,
  retryFailed,
  cancelPending,
  runAutomationsNow,
  processQueueNow,
} from "@/lib/messaging.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "মেসেজ ম্যানেজমেন্ট — অ্যাডমিন | Milestone Certificate Institute" },
      { name: "description", content: "পরীক্ষার্থীদের SMS পাঠানো, অটোমেশন, টেমপ্লেট ও রিপোর্ট।" },
      {
        property: "og:title",
        content: "মেসেজ ম্যানেজমেন্ট — অ্যাডমিন | Milestone Certificate Institute",
      },
      {
        property: "og:description",
        content: "পরীক্ষার্থীদের SMS পাঠানো, অটোমেশন, টেমপ্লেট ও রিপোর্ট।",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Messages,
});

type Tab = "send" | "auto" | "tpl" | "report" | "centers";
const TABS: [Tab, string][] = [
  ["send", "মেসেজ পাঠান"],
  ["auto", "অটোমেশন"],
  ["tpl", "টেমপ্লেট"],
  ["report", "রিপোর্ট"],
  ["centers", "কেন্দ্রের ঠিকানা"],
];
const DAY_LABEL: Record<string, string> = {
  today: "আজকের পরীক্ষা",
  tomorrow: "আগামীকালের পরীক্ষা",
  day_after: "পরশুর পরীক্ষা",
  custom: "কাস্টম তারিখ ও সময়",
};

const tplQ = {
  queryKey: ["sms-templates"],
  queryFn: async () =>
    (await supabase.from("sms_templates").select("*").order("created_at")).data ?? [],
};
const autoQ = {
  queryKey: ["sms-automations"],
  queryFn: async () =>
    (await supabase.from("sms_automations").select("*").order("created_at")).data ?? [],
};
const logQ = {
  queryKey: ["sms-messages"],
  refetchInterval: 15000,
  queryFn: async () =>
    (
      await supabase
        .from("sms_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500)
    ).data ?? [],
};

function useCtx() {
  // `?? []` creates a new array on every render and would defeat the memo below.
  const ttcsData = useQuery(ttcQ).data;
  const occsData = useQuery(occQ).data;
  const accountsData = useQuery({ queryKey: ["accounts"], queryFn: () => listAccounts() }).data;
  const ttcs = useMemo(() => ttcsData ?? [], [ttcsData]);
  const occs = useMemo(() => occsData ?? [], [occsData]);
  const accounts = useMemo(() => accountsData ?? [], [accountsData]);
  const ctx: MsgCtx = useMemo(
    () => ({
      ttc: new Map(
        ttcs.map((t) => [
          t.id,
          { name: t.name, address: (t as { address?: string | null }).address ?? null },
        ]),
      ),
      occ: new Map(occs.map((o) => [o.id, o.name])),
      agents: new Map(accounts.map((a) => [a.id, { name: a.name, mobile: a.mobile }])),
    }),
    [ttcs, occs, accounts],
  );
  return {
    ctx,
    ttcs,
    accounts: accounts.filter((a) => a.role === "agent" || a.role === "reception_agent"),
  };
}

function FilterEditor({
  f,
  setF,
  hideDay,
}: {
  f: MsgFilter;
  setF: (f: MsgFilter) => void;
  hideDay?: boolean;
}) {
  const { ttcs, accounts } = useCtx();
  const { data: works = [] } = useQuery(worksQ);
  const [q, setQ] = useState("");
  const pool = selectRecipients(works, { ...f, mode: "all", ids: [], limit: null });
  const s = q.trim().toLowerCase();
  const found = s
    ? pool
        .filter((w) =>
          [w.candidate_name, w.passport_no, w.ref_code, w.mobile].some((v) =>
            v?.toLowerCase().includes(s),
          ),
        )
        .slice(0, 20)
    : [];
  const sel = "h-10 w-full rounded-lg border bg-card px-2 text-sm";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {!hideDay && (
          <div>
            <Label>পরীক্ষার দিন</Label>
            <select
              className={sel}
              value={f.day}
              onChange={(e) => setF({ ...f, day: e.target.value as MsgFilter["day"] })}
            >
              <option value="today">আজ</option>
              <option value="tomorrow">আগামীকাল</option>
              <option value="day_after">পরশু</option>
              <option value="date">নির্দিষ্ট তারিখ</option>
              <option value="any">সব তারিখ</option>
            </select>
          </div>
        )}
        {f.day === "date" && (
          <div>
            <Label>তারিখ</Label>
            <DateSelect
              value={f.date ?? ""}
              onChange={(e) => setF({ ...f, date: e.target.value })}
            />
          </div>
        )}
        <div>
          <Label>এজেন্সি</Label>
          <select
            className={sel}
            value={f.agent_id ?? ""}
            onChange={(e) => setF({ ...f, agent_id: e.target.value || null })}
          >
            <option value="">সকল এজেন্সি</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.agent_code ? ` (${a.agent_code})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>কেন্দ্র</Label>
          <select
            className={sel}
            value={f.ttc_id ?? ""}
            onChange={(e) => setF({ ...f, ttc_id: e.target.value || null })}
          >
            <option value="">সব কেন্দ্র</option>
            {ttcs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>রিসিপশন</Label>
          <select
            className={sel}
            value={f.receive}
            onChange={(e) => setF({ ...f, receive: e.target.value as MsgFilter["receive"] })}
          >
            <option value="any">সবাই</option>
            <option value="received">রিসিভ হয়েছে</option>
            <option value="not_received">রিসিভ হয়নি</option>
          </select>
        </div>
        <div>
          <Label>প্রাপক</Label>
          <select
            className={sel}
            value={f.mode}
            onChange={(e) => setF({ ...f, mode: e.target.value as MsgFilter["mode"] })}
          >
            <option value="all">সকল পরীক্ষার্থী</option>
            <option value="include">শুধু নির্দিষ্ট পরীক্ষার্থী</option>
            <option value="exclude">নির্দিষ্টদের বাদ দিয়ে</option>
          </select>
        </div>
        <div>
          <Label>সর্বোচ্চ সংখ্যা (ঐচ্ছিক)</Label>
          <Input
            type="number"
            min={0}
            value={f.limit ?? ""}
            onChange={(e) => setF({ ...f, limit: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>
      {f.mode !== "all" && (
        <div className="rounded-xl border p-3">
          <Input
            placeholder="নাম / পাসপোর্ট / রেফারেন্স / মোবাইল দিয়ে খুঁজে যোগ করুন"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {found.map((w) => (
            <button
              type="button"
              key={w.id}
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
              onClick={() => {
                if (!f.ids.includes(w.id)) setF({ ...f, ids: [...f.ids, w.id] });
                setQ("");
              }}
            >
              + {w.candidate_name} · {w.passport_no}
            </button>
          ))}
          <div className="mt-2 flex flex-wrap gap-1">
            {f.ids.map((id) => {
              const w = works.find((x) => x.id === id);
              return (
                <span key={id} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {w?.candidate_name ?? id.slice(0, 6)}{" "}
                  <button
                    type="button"
                    onClick={() => setF({ ...f, ids: f.ids.filter((x) => x !== id) })}
                  >
                    ✕
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SendTab() {
  const qc = useQueryClient();
  const { ctx } = useCtx();
  const { data: works = [] } = useQuery(worksQ);
  const tpls = useQuery(tplQ).data ?? [];
  const [f, setF] = useState<MsgFilter>(DEFAULT_FILTER);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const tpl = tpls.find((t) => t.id === templateId) ?? null;
  const body = tpl?.body ?? "";
  const list = selectRecipients(works, f);
  const rendered = tpl ? list.map((w) => ({ w, ...renderMessage(body, w, ctx) })) : [];
  const bad = rendered.filter((r) => r.missing.length);
  const ok = rendered.length - bad.length;
  const send = async () => {
    if (!tpl) return toast.error("আগে একটি টেমপ্লেট বাছাই করুন");
    if (!ok) return toast.error("পাঠানোর মতো কোনো প্রাপক নেই");
    if (
      !window.confirm(
        `${ok} জনকে SMS পাঠাবেন?${bad.length ? `\n${bad.length} জনের তথ্য অসম্পূর্ণ — তাদের বাদ দেওয়া হবে।` : ""}`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await sendMessagesNow({ data: { filter: f, templateId: tpl.id } });
      toast.success(`পাঠানো: ${r.sent}, ব্যর্থ: ${r.failed}, আগেই পাঠানো: ${r.duplicates}`);
      qc.invalidateQueries({ queryKey: ["sms-messages"] });
    } catch {
      toast.error("পাঠানো যায়নি");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <FilterEditor f={f} setF={setF} />
      <div>
        <Label>টেমপ্লেট *</Label>
        <select
          className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">— টেমপ্লেট বাছাই করুন —</option>
          {tpls.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {!tpls.length && (
          <p className="mt-1 text-xs text-destructive">
            আগে “টেমপ্লেট” ট্যাবে একটি টেমপ্লেট তৈরি করুন।
          </p>
        )}
        {tpl && (
          <pre className="mt-2 whitespace-pre-wrap rounded-xl border bg-card p-3 text-sm">
            {tpl.body}
          </pre>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          নিরাপত্তার জন্য শুধু সংরক্ষিত টেমপ্লেট থেকে মেসেজ পাঠানো যায়।{" "}
          {PLACEHOLDERS.map(([k, l]) => `${k} = ${l}`).join(" · ")}
        </p>
      </div>
      <div className="rounded-xl border bg-muted/40 p-3 text-sm">
        নির্বাচিত: <b>{bn(rendered.length)}</b> জন · পাঠানো যাবে:{" "}
        <b className="text-primary">{bn(ok)}</b> · তথ্য অসম্পূর্ণ:{" "}
        <b className="text-destructive">{bn(bad.length)}</b>
        {bad.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-destructive">
            {bad.slice(0, 15).map((r) => (
              <li key={r.w.id}>
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                {r.w.candidate_name}: {r.missing.join(", ")} নেই — সংশোধন করুন
              </li>
            ))}
          </ul>
        )}
      </div>
      {rendered.find((r) => !r.missing.length) && (
        <div>
          <Label>প্রিভিউ ({rendered.find((r) => !r.missing.length)!.w.candidate_name})</Label>
          <pre className="whitespace-pre-wrap rounded-xl border bg-card p-3 text-sm">
            {rendered.find((r) => !r.missing.length)!.text}
          </pre>
        </div>
      )}
      <Button onClick={send} disabled={busy}>
        <Send className="mr-1 h-4 w-4" />
        {busy ? "পাঠানো হচ্ছে..." : `${bn(ok)} জনকে পাঠান`}
      </Button>
    </div>
  );
}

function AutoTab() {
  const qc = useQueryClient();
  const tpls = useQuery(tplQ).data ?? [];
  const autos = useQuery(autoQ).data ?? [];
  const blank = {
    id: "",
    name: "",
    template_id: "",
    schedule: "today",
    send_hour: 8,
    custom_at: "",
    filter: DEFAULT_FILTER,
  };
  const [ed, setEd] = useState<typeof blank | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["sms-automations"] });
  const save = async () => {
    if (!ed) return;
    if (!ed.name.trim() || !ed.template_id) return toast.error("নাম ও টেমপ্লেট দিন");
    if (ed.schedule === "custom" && !ed.custom_at) return toast.error("তারিখ ও সময় দিন");
    const row = {
      name: ed.name.trim(),
      template_id: ed.template_id,
      schedule: ed.schedule,
      send_hour: ed.send_hour,
      custom_at: ed.schedule === "custom" ? new Date(ed.custom_at).toISOString() : null,
      filter: ed.filter as never,
      last_run_on: null,
    };
    const { error } = ed.id
      ? await supabase.from("sms_automations").update(row).eq("id", ed.id)
      : await supabase.from("sms_automations").insert(row);
    if (error) return toast.error("সংরক্ষণ করা যায়নি");
    toast.success("অটোমেশন সংরক্ষিত");
    setEd(null);
    refresh();
  };
  if (!tpls.length)
    return (
      <p className="text-sm text-muted-foreground">
        আগে "টেমপ্লেট" ট্যাবে একটি টেমপ্লেট তৈরি করুন।
      </p>
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEd({ ...blank, template_id: tpls[0]!.id })}>
          + নতুন অটোমেশন
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const r = await runAutomationsNow().catch(() => null);
            if (r) {
              toast.success(`চালানো: ${r.ran}, পাঠানো: ${r.sent}, ব্যর্থ: ${r.failed}`);
            } else {
              toast.error("চালানো যায়নি");
            }
          }}
        >
          <Play className="mr-1 h-4 w-4" /> এখনই যাচাই করুন
        </Button>
      </div>
      {ed && (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>নাম</Label>
              <Input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} />
            </div>
            <div>
              <Label>টেমপ্লেট</Label>
              <select
                className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
                value={ed.template_id}
                onChange={(e) => setEd({ ...ed, template_id: e.target.value })}
              >
                {tpls.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>কখন</Label>
              <select
                className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
                value={ed.schedule}
                onChange={(e) => setEd({ ...ed, schedule: e.target.value })}
              >
                {Object.entries(DAY_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {ed.schedule === "custom" ? (
              <div>
                <Label>পাঠানোর তারিখ ও সময়</Label>
                <Input
                  type="datetime-local"
                  value={ed.custom_at}
                  onChange={(e) => setEd({ ...ed, custom_at: e.target.value })}
                />
              </div>
            ) : (
              <div>
                <Label>প্রতিদিন পাঠানোর সময় (বাংলাদেশ)</Label>
                <select
                  className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
                  value={ed.send_hour}
                  onChange={(e) => setEd({ ...ed, send_hour: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option
                      key={h}
                      value={h}
                    >{`${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <FilterEditor
            f={ed.filter}
            setF={(filter) => setEd({ ...ed, filter })}
            hideDay={ed.schedule !== "custom"}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>
              সংরক্ষণ
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEd(null)}>
              বাতিল
            </Button>
          </div>
        </div>
      )}
      <ul className="divide-y rounded-xl border bg-card">
        {autos.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">কোনো অটোমেশন নেই।</li>
        )}
        {autos.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground">
                {DAY_LABEL[a.schedule]} ·{" "}
                {a.schedule === "custom"
                  ? a.custom_at
                    ? new Date(a.custom_at).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })
                    : "—"
                  : `প্রতিদিন ${((a.send_hour + 11) % 12) + 1}:00 ${a.send_hour < 12 ? "AM" : "PM"}`}{" "}
                · টেমপ্লেট: {tpls.find((t) => t.id === a.template_id)?.name ?? "—"}
                {a.last_run_on ? ` · শেষ চালানো: ${a.last_run_on}` : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={a.active ? "default" : "outline"}
                onClick={async () => {
                  await supabase
                    .from("sms_automations")
                    .update({ active: !a.active })
                    .eq("id", a.id);
                  refresh();
                }}
              >
                {a.active ? "চালু" : "বন্ধ"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setEd({
                    id: a.id,
                    name: a.name,
                    template_id: a.template_id,
                    schedule: a.schedule,
                    send_hour: a.send_hour,
                    custom_at: a.custom_at
                      ? new Date(new Date(a.custom_at).getTime() + 6 * 3600e3)
                          .toISOString()
                          .slice(0, 16)
                      : "",
                    filter: { ...DEFAULT_FILTER, ...(a.filter as object) } as MsgFilter,
                  })
                }
              >
                এডিট
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  if (!window.confirm("অটোমেশনটি মুছবেন?")) return;
                  await supabase.from("sms_automations").delete().eq("id", a.id);
                  refresh();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TplTab() {
  const qc = useQueryClient();
  const tpls = useQuery(tplQ).data ?? [];
  const { ctx, accounts, ttcs } = useCtx();
  const { data: works = [] } = useQuery(worksQ);
  const [ed, setEd] = useState<{
    id: string;
    name: string;
    body: string;
    agent_id: string;
    ttc_id: string;
  } | null>(null);
  const sample = works.find((w) => w.status === "approved");
  const save = async () => {
    if (!ed || !ed.name.trim() || ed.body.trim().length < 5) return toast.error("নাম ও মেসেজ দিন");
    const row = {
      name: ed.name.trim(),
      body: ed.body,
      agent_id: ed.agent_id || null,
      ttc_id: ed.ttc_id || null,
    };
    const { error } = ed.id
      ? await supabase.from("sms_templates").update(row).eq("id", ed.id)
      : await supabase.from("sms_templates").insert(row);
    if (error) return toast.error("সংরক্ষণ করা যায়নি");
    setEd(null);
    qc.invalidateQueries({ queryKey: ["sms-templates"] });
    toast.success("টেমপ্লেট সংরক্ষিত");
  };
  return (
    <div className="space-y-4">
      <Button
        size="sm"
        onClick={() =>
          setEd({ id: "", name: "", body: DEFAULT_TEMPLATE, agent_id: "", ttc_id: "" })
        }
      >
        + নতুন টেমপ্লেট
      </Button>
      {ed && (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>নাম</Label>
              <Input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} />
            </div>
            <div>
              <Label>এজেন্সির জন্য (ঐচ্ছিক)</Label>
              <select
                className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
                value={ed.agent_id}
                onChange={(e) => setEd({ ...ed, agent_id: e.target.value })}
              >
                <option value="">সবার জন্য</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>কেন্দ্রের জন্য (ঐচ্ছিক)</Label>
              <select
                className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
                value={ed.ttc_id}
                onChange={(e) => setEd({ ...ed, ttc_id: e.target.value })}
              >
                <option value="">সব কেন্দ্র</option>
                {ttcs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Textarea
            rows={9}
            value={ed.body}
            onChange={(e) => setEd({ ...ed, body: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {PLACEHOLDERS.map(([k, l]) => `${k} = ${l}`).join(" · ")}
          </p>
          {sample && (
            <pre className="whitespace-pre-wrap rounded-xl border bg-card p-3 text-sm">
              {renderMessage(ed.body, sample, ctx).text}
            </pre>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>
              সংরক্ষণ
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEd(null)}>
              বাতিল
            </Button>
          </div>
        </div>
      )}
      <ul className="divide-y rounded-xl border bg-card">
        {tpls.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">কোনো টেমপ্লেট নেই।</li>
        )}
        {tpls.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground">{t.body}</div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setEd({
                    id: t.id,
                    name: t.name,
                    body: t.body,
                    agent_id: t.agent_id ?? "",
                    ttc_id: t.ttc_id ?? "",
                  })
                }
              >
                এডিট
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  if (!window.confirm("টেমপ্লেট মুছবেন? এর অটোমেশনও মুছে যাবে।")) return;
                  await supabase.from("sms_templates").delete().eq("id", t.id);
                  qc.invalidateQueries({ queryKey: ["sms-templates"] });
                  qc.invalidateQueries({ queryKey: ["sms-automations"] });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ST: Record<string, [string, string]> = {
  sent: ["পাঠানো হয়েছে", "text-primary"],
  failed: ["ব্যর্থ", "text-destructive"],
  pending: ["অপেক্ষায়", "text-muted-foreground"],
  sending: ["পাঠানো হচ্ছে", "text-muted-foreground"],
  cancelled: ["বাতিল", "text-muted-foreground"],
};

function ReportTab() {
  const qc = useQueryClient();
  const logs = useQuery(logQ).data ?? [];
  const n = (s: string) => logs.filter((l) => l.status === s).length;
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    await fn()
      .then(() => toast.success(msg))
      .catch(() => toast.error("কাজটি করা যায়নি"));
    qc.invalidateQueries({ queryKey: ["sms-messages"] });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["মোট", logs.length],
          ["পাঠানো", n("sent")],
          ["ব্যর্থ", n("failed")],
          ["অপেক্ষায়", n("pending") + n("sending")],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border bg-card p-3 text-center">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-bold">{bn(Number(v))}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => act(() => processQueueNow(), "অপেক্ষমান মেসেজ পাঠানো হয়েছে")}
        >
          <Send className="mr-1 h-4 w-4" /> অপেক্ষমান পাঠান
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => act(() => retryFailed(), "ব্যর্থগুলো আবার চেষ্টা করা হয়েছে")}
        >
          <RefreshCw className="mr-1 h-4 w-4" /> ব্যর্থগুলো আবার পাঠান
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() =>
            window.confirm("সব অপেক্ষমান মেসেজ বাতিল করবেন?") &&
            act(() => cancelPending(), "অপেক্ষমান মেসেজ বাতিল হয়েছে")
          }
        >
          <Ban className="mr-1 h-4 w-4" /> অপেক্ষমান বাতিল
        </Button>
      </div>
      <ul className="divide-y rounded-xl border bg-card text-sm">
        {logs.length === 0 && <li className="p-4 text-muted-foreground">এখনো কোনো মেসেজ নেই।</li>}
        {logs.map((l) => (
          <li key={l.id} className="flex flex-wrap justify-between gap-2 p-3">
            <span>
              {l.recipient_name ?? "—"} · {l.phone}
            </span>
            <span className={ST[l.status]?.[1]}>
              {ST[l.status]?.[0] ?? l.status}
              {l.error ? ` (${l.error})` : ""} ·{" "}
              {new Date(l.sent_at ?? l.created_at).toLocaleString("bn-BD", {
                timeZone: "Asia/Dhaka",
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CentersTab() {
  const qc = useQueryClient();
  const ttcs = useQuery(ttcQ).data ?? [];
  const [vals, setVals] = useState<Record<string, string>>({});
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        ঠিকানা না থাকলে সেই কেন্দ্রের পরীক্ষার্থীদের {"{address}"} সহ মেসেজ পাঠানো হবে না।
      </p>
      {ttcs.map((t) => {
        const cur = (t as { address?: string | null }).address ?? "";
        return (
          <div key={t.id} className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
            <div className="min-w-0 flex-1">
              <Label>{t.name}</Label>
              <Input
                value={vals[t.id] ?? cur}
                placeholder="পূর্ণ ঠিকানা"
                onChange={(e) => setVals({ ...vals, [t.id]: e.target.value })}
              />
            </div>
            <Button
              size="sm"
              onClick={async () => {
                const { error } = await supabase
                  .from("ttc_centers")
                  .update({ address: (vals[t.id] ?? cur).trim() || null })
                  .eq("id", t.id);
                if (error) {
                  toast.error("সংরক্ষণ করা যায়নি");
                } else {
                  toast.success("ঠিকানা সংরক্ষিত");
                  void qc.invalidateQueries({ queryKey: ["ttc"] });
                }
              }}
            >
              সংরক্ষণ
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function Messages() {
  const [tab, setTab] = useState<Tab>("send");
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="font-display text-2xl font-bold">মেসেজ ম্যানেজমেন্ট</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${tab === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <section className="rounded-2xl border bg-card/95 p-5 shadow-sm">
        {tab === "send" ? (
          <SendTab />
        ) : tab === "auto" ? (
          <AutoTab />
        ) : tab === "tpl" ? (
          <TplTab />
        ) : tab === "report" ? (
          <ReportTab />
        ) : (
          <CentersTab />
        )}
      </section>
    </div>
  );
}
