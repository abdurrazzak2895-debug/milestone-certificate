/** Pure recipient selection + message rendering shared by the admin preview and the server sender. */
export type Day = "any" | "today" | "tomorrow" | "day_after" | "date";
export type MsgFilter = {
  mode: "all" | "include" | "exclude";
  ids: string[];
  limit?: number | null;
  agent_id?: string | null;
  ttc_id?: string | null;
  receive: "any" | "received" | "not_received";
  day: Day;
  date?: string | null;
};
export const DEFAULT_FILTER: MsgFilter = { mode: "all", ids: [], receive: "any", day: "today" };

export type MsgWork = {
  id: string; candidate_name: string; passport_no: string; ref_code: string; mobile: string;
  exam_at: string; ttc_id: string | null; occupation_id: string | null; submitted_by: string;
  arrival_status: string; status: string;
};
export type MsgCtx = {
  ttc: Map<string, { name: string; address: string | null }>;
  occ: Map<string, string>;
  agents: Map<string, { name: string; mobile: string }>;
};

export const PLACEHOLDERS: [string, string][] = [
  ["{name}", "পরীক্ষার্থীর নাম"], ["{passport}", "পাসপোর্ট"], ["{ref}", "রেফারেন্স"], ["{occupation}", "পেশা"],
  ["{date}", "পরীক্ষার তারিখ"], ["{time}", "পরীক্ষার সময়"], ["{report_time}", "উপস্থিতির সময় (১ ঘণ্টা আগে)"],
  ["{center}", "কেন্দ্র"], ["{address}", "কেন্দ্রের ঠিকানা"], ["{agent}", "এজেন্ট"], ["{agent_mobile}", "এজেন্টের মোবাইল"],
];

export const DEFAULT_TEMPLATE = `📢 পরীক্ষার নির্দেশনা
প্রিয় {name},
📍 কেন্দ্র: টিটিসি {center}
🏢 ঠিকানা: {address}
📅 তারিখ: {date}
⏰ সময়: {time}
🕘 উপস্থিতি: {report_time} এর মধ্যে
📄 পাসপোর্ট ও Takamul টিকেট সাথে আনুন।
যোগাযোগ: {agent} ({agent_mobile})
— Milestone Certificate Institute`;

const dhakaDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
export const dayFor = (day: Day, date: string | null | undefined, now = new Date()) =>
  day === "today" ? dhakaDay(now) : day === "tomorrow" ? dhakaDay(new Date(now.getTime() + 864e5))
  : day === "day_after" ? dhakaDay(new Date(now.getTime() + 2 * 864e5)) : day === "date" ? date ?? null : null;

export function selectRecipients<T extends MsgWork>(works: T[], f: MsgFilter, now = new Date()): T[] {
  const target = dayFor(f.day, f.date, now);
  const ids = new Set(f.ids);
  let list = works.filter((w) => w.status === "approved"
    && (!target || (!!w.exam_at && dhakaDay(new Date(w.exam_at)) === target))
    && (!f.agent_id || w.submitted_by === f.agent_id)
    && (!f.ttc_id || w.ttc_id === f.ttc_id)
    && (f.receive === "any" || (f.receive === "received" ? w.arrival_status === "received" : w.arrival_status !== "received"))
    && (f.mode === "all" || (f.mode === "include" ? ids.has(w.id) : !ids.has(w.id))));
  list = [...list].sort((a, b) => (a.exam_at ?? "").localeCompare(b.exam_at ?? ""));
  return f.limit && f.limit > 0 ? list.slice(0, f.limit) : list;
}

export function toPhone(m: string | null | undefined) {
  const d = (m ?? "").replace(/\D/g, "").slice(-11);
  return /^01[3-9]\d{8}$/.test(d) ? `88${d}` : null;
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "long", year: "numeric" });
const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });

/** Renders a template; any used placeholder without stored data is reported, never guessed. */
export function renderMessage(body: string, w: MsgWork, c: MsgCtx) {
  const at = w.exam_at ? new Date(w.exam_at) : null;
  const t = w.ttc_id ? c.ttc.get(w.ttc_id) : undefined;
  const a = c.agents.get(w.submitted_by);
  const vals: Record<string, string | null | undefined> = {
    "{name}": w.candidate_name, "{passport}": w.passport_no, "{ref}": w.ref_code,
    "{occupation}": w.occupation_id ? c.occ.get(w.occupation_id) : null,
    "{date}": at ? fmtDate(at) : null, "{time}": at ? fmtTime(at) : null,
    "{report_time}": at ? fmtTime(new Date(at.getTime() - 3600e3)) : null,
    "{center}": t?.name, "{address}": t?.address, "{agent}": a?.name, "{agent_mobile}": a?.mobile,
  };
  const missing: string[] = [];
  let text = body;
  for (const [k, label] of PLACEHOLDERS) {
    if (!text.includes(k)) continue;
    const v = vals[k]?.trim();
    if (!v) missing.push(label);
    text = text.split(k).join(v ?? "");
  }
  const phone = toPhone(w.mobile);
  if (!phone) missing.push("সঠিক মোবাইল নম্বর");
  return { text, phone, missing };
}
