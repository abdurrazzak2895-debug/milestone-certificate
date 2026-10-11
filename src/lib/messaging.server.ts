import { selectRecipients, renderMessage, type MsgFilter, type MsgWork, type MsgCtx, type Day } from "./messaging";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function sendSms(phone: string, message: string): Promise<string | null> {
  const params = new URLSearchParams({ api_key: process.env["BULKSMSBD_API_KEY"] ?? "", type: "text", number: phone, senderid: process.env["BULKSMSBD_SENDER_ID"] ?? "", message });
  try {
    const res = await fetch(`http://bulksmsbd.net/api/smsapi?${params}`);
    const text = await res.text();
    let code: unknown;
    try { code = (JSON.parse(text) as { response_code?: unknown }).response_code; } catch { code = undefined; }
    return String(code) === "202" ? null : `SMS সার্ভিস: ${String(code ?? res.status)}`;
  } catch {
    return "নেটওয়ার্ক সমস্যা";
  }
}

async function loadData(): Promise<{ works: MsgWork[]; ctx: MsgCtx }> {
  const db = await admin();
  const works: MsgWork[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("job_submissions").select("id,candidate_name,passport_no,ref_code,mobile,exam_at,ttc_id,occupation_id,submitted_by,arrival_status,status").eq("status", "approved").range(from, from + 999);
    works.push(...((data ?? []) as MsgWork[]));
    if (!data || data.length < 1000) break;
  }
  const [{ data: t }, { data: o }, { data: a }] = await Promise.all([
    db.from("ttc_centers").select("id,name,address"), db.from("occupations").select("id,name"), db.from("agent_accounts").select("user_id,full_name,mobile"),
  ]);
  return {
    works,
    ctx: {
      ttc: new Map((t ?? []).map((x) => [x.id, { name: x.name, address: x.address }])),
      occ: new Map((o ?? []).map((x) => [x.id, x.name])),
      agents: new Map((a ?? []).map((x) => [x.user_id, { name: x.full_name, mobile: x.mobile }])),
    },
  };
}

/** Queues one message per recipient. dedupe_key blocks the same message reason reaching a candidate twice. */
export async function enqueue(filter: MsgFilter, body: string, reason: string, opts: { automationId?: string; userId?: string } = {}) {
  const db = await admin();
  const { works, ctx } = await loadData();
  const list = selectRecipients(works, filter);
  const skipped: { name: string; missing: string[] }[] = [];
  const rows = [];
  for (const w of list) {
    const r = renderMessage(body, w, ctx);
    if (r.missing.length || !r.phone) { skipped.push({ name: w.candidate_name, missing: r.missing }); continue; }
    rows.push({ dedupe_key: `${reason}:${w.id}:${(w.exam_at ?? "").slice(0, 10)}`, automation_id: opts.automationId ?? null, submission_id: w.id, recipient_name: w.candidate_name, phone: r.phone, body: r.text, created_by: opts.userId ?? null });
  }
  let queued = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data } = await db.from("sms_messages").upsert(rows.slice(i, i + 200), { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
    queued += data?.length ?? 0;
  }
  return { selected: list.length, queued, duplicates: rows.length - queued, skipped };
}

/** Sends pending messages; failures stay retryable up to 3 attempts via status 'failed' + manual retry. */
export async function processPending(max = 150) {
  const db = await admin();
  const { data } = await db.from("sms_messages").select("id,phone,body").eq("status", "pending").order("created_at").limit(max);
  let sent = 0, failed = 0;
  for (const m of data ?? []) {
    // Claim the row first so a parallel run cannot send it again.
    const { data: claimed } = await db.from("sms_messages").update({ status: "sending" }).eq("id", m.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    const err = await sendSms(m.phone, m.body);
    await db.from("sms_messages").update(err ? { status: "failed", error: err } : { status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", m.id);
    err ? failed++ : sent++;
  }
  return { sent, failed };
}

/** Runs due automations (Dhaka time). Each daily automation fires once per day after its hour. */
export async function runAutomations(now = new Date()) {
  const db = await admin();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const hour = Number(now.toLocaleString("en-US", { timeZone: "Asia/Dhaka", hour: "2-digit", hour12: false })) % 24;
  const { data: autos } = await db.from("sms_automations").select("*, sms_templates(body)").eq("active", true);
  let ran = 0;
  for (const a of autos ?? []) {
    const body = (a as { sms_templates: { body: string } | null }).sms_templates?.body;
    if (!body) continue;
    const custom = a.schedule === "custom";
    const due = custom ? !!a.custom_at && new Date(a.custom_at) <= now && !a.last_run_on : hour >= a.send_hour && a.last_run_on !== today;
    if (!due) continue;
    const f = { ...(a.filter as MsgFilter) };
    if (!custom) f.day = a.schedule as Day;
    await db.from("sms_automations").update({ last_run_on: today }).eq("id", a.id);
    await enqueue(f, body, `auto:${a.id}`, { automationId: a.id });
    ran++;
  }
  return { ran };
}
