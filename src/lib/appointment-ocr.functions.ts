import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const MAX_BYTES = 8 * 1024 * 1024;
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "candidate_name",
    "passport_no",
    "booking_no",
    "exam_date",
    "exam_time",
    "reporting_time",
    "center",
    "occupation",
    "confidence",
    "ambiguities",
  ],
  properties: {
    candidate_name: { type: ["string", "null"] },
    passport_no: { type: ["string", "null"] },
    booking_no: { type: ["string", "null"] },
    exam_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    exam_time: { type: ["string", "null"], description: "HH:MM 24h local time of the exam itself" },
    reporting_time: {
      type: ["string", "null"],
      description: "HH:MM 24h reporting/arrival time if separate",
    },
    center: { type: ["string", "null"] },
    occupation: { type: ["string", "null"] },
    confidence: { type: "number", description: "0-1 overall confidence" },
    ambiguities: { type: "array", items: { type: "string" } },
  },
} as const;

export type Extracted = {
  candidate_name: string | null;
  passport_no: string | null;
  booking_no: string | null;
  exam_date: string | null;
  exam_time: string | null;
  reporting_time: string | null;
  center: string | null;
  occupation: string | null;
  confidence: number;
  ambiguities: string[];
};

async function assertAdmin(ctx: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("শুধু অ্যাডমিন এটি করতে পারবেন");
}

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const scanAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = context.supabase;
    const { data: w, error: we } = await sb
      .from("job_submissions")
      .select("id,ticket_path,passport_no,candidate_name,exam_at")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (we || !w) return { error: "কাজটি পাওয়া যায়নি" };

    const save = (row: Record<string, unknown>) =>
      sb.from("appointment_extractions").insert({
        submission_id: w.id,
        created_by: context.userId,
        old_exam_at: w.exam_at,
        ...row,
      });

    const ext = (w.ticket_path.split(".").pop() ?? "").toLowerCase();
    const mime = MIME[ext];
    if (!mime) {
      await save({ status: "failed", error: "unsupported file type" });
      return { error: "শুধু PDF/JPG/PNG ফাইল সমর্থিত" };
    }
    const { data: file, error: fe } = await sb.storage
      .from("candidate-photos")
      .download(w.ticket_path);
    if (fe || !file) {
      await save({ status: "failed", error: "file not accessible" });
      return { error: "ফাইলটি খোলা যায়নি" };
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      await save({ status: "failed", error: "bad size" });
      return { error: "ফাইলটি খালি বা ৮MB-এর বেশি" };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const head = String.fromCharCode(...bytes.slice(0, 4));
    const okMagic =
      mime === "application/pdf"
        ? head === "%PDF"
        : mime === "image/png"
          ? bytes[0] === 0x89 && head.slice(1) === "PNG"
          : bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!okMagic) {
      await save({ status: "failed", error: "content mismatch" });
      return { error: "ফাইলের ধরন সঠিক নয়" };
    }
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const b64 = btoa(bin);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { error: "OCR সার্ভিস কনফিগার করা নেই" };
    const part =
      mime === "application/pdf"
        ? {
            type: "input_file",
            filename: "ticket.pdf",
            file_data: `data:application/pdf;base64,${b64}`,
          }
        : { type: "input_image", image_url: `data:${mime};base64,${b64}` };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "medium" },
        instructions:
          "You read Saudi SVP / Takamul exam appointment tickets (may be rotated or blurry). Extract only what is clearly printed; use null when missing or unreadable — never guess. Keep exam time and reporting/arrival time separate. Times are local center time (Bangladesh). If several exam dates/times compete, list each in ambiguities and lower confidence. Never put arrival/reporting instructions (e.g. arrive N minutes early) in ambiguities.",
        text: {
          format: { type: "json_schema", name: "appointment", strict: true, schema: SCHEMA },
        },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Extract the appointment details from this ticket." },
              part,
            ],
          },
        ],
      }),
    });
    if (!res.ok || !res.body) {
      console.error("OCR gateway error", res.status, await res.text().catch(() => ""));
      await save({ status: "failed", error: `gateway ${res.status}` });
      if (res.status === 429) return { error: "অনেক অনুরোধ, একটু পরে আবার চেষ্টা করুন" };
      if (res.status === 402) return { error: "AI ক্রেডিট শেষ হয়ে গেছে" };
      return { error: "OCR ব্যর্থ হয়েছে, পরে আবার চেষ্টা করুন বা ম্যানুয়ালি দিন" };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "",
      text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "response.output_text.delta") text += ev.delta;
        } catch {
          /* partial */
        }
      }
    }
    let x: Extracted;
    try {
      x = JSON.parse(text);
    } catch {
      await save({ status: "failed", error: "unparseable output" });
      return { error: "ডকুমেন্ট পড়া যায়নি — ম্যানুয়াল রিভিউ দরকার" };
    }

    // Arrival/reporting instructions (e.g. "arrive 15 minutes early") are not shown to admin.
    const warnings = x.ambiguities.filter(
      (a) => !/report|arriv|minute|early|before|মিনিট|উপস্থিত|আগে/i.test(a),
    );
    if (x.passport_no && norm(x.passport_no) !== norm(w.passport_no))
      warnings.push(`পাসপোর্ট মিলছে না (টিকিটে ${x.passport_no})`);
    if (x.candidate_name && norm(x.candidate_name) !== norm(w.candidate_name))
      warnings.push(`নাম মিলছে না (টিকিটে ${x.candidate_name})`);
    if (!x.exam_date || !x.exam_time) warnings.push("পরীক্ষার তারিখ/সময় পরিষ্কার নয়");
    if (x.confidence < 0.8) warnings.push("কম নির্ভরযোগ্যতা");
    if (x.booking_no) {
      const { data: dups } = await sb
        .from("appointment_extractions")
        .select("submission_id,extracted")
        .neq("submission_id", w.id)
        .eq("extracted->>booking_no", x.booking_no)
        .limit(1);
      if (dups?.length) warnings.push("এই বুকিং নম্বর অন্য কাজেও পাওয়া গেছে");
    }
    const { data: row } = await save({
      status: "needs_review",
      extracted: x,
      confidence: x.confidence,
      warnings,
    })
      .select()
      .single();
    return { extraction: row };
  });

export const verifyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        extractionId: z.string().uuid(),
        examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        examTime: z.string().regex(/^\d{2}:\d{2}$/),
        reportingTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable(),
        reason: z.string().max(500).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = context.supabase;
    const { data: e } = await sb
      .from("appointment_extractions")
      .select("*")
      .eq("id", data.extractionId)
      .maybeSingle();
    if (!e) return { error: "রেকর্ড পাওয়া যায়নি" };
    const x = e.extracted as Partial<Extracted>;
    const corrected = x.exam_date !== data.examDate || x.exam_time !== data.examTime;
    if (corrected && !data.reason?.trim()) return { error: "সংশোধনের কারণ লিখুন" };
    const examAt = new Date(`${data.examDate}T${data.examTime}:00+06:00`).toISOString();
    const { data: w, error: ue } = await sb
      .from("job_submissions")
      .update({ exam_at: examAt })
      .eq("id", e.submission_id)
      .select("exam_id")
      .single();
    if (ue) return { error: "পরীক্ষার সময় আপডেট করা যায়নি" };
    if (w?.exam_id)
      await sb
        .from("exams")
        .update({ exam_date: data.examDate, exam_time: `${data.examTime}:00` })
        .eq("id", w.exam_id);
    // The reviewed status must actually persist; reporting ok after a failed write left
    // the extraction stuck on needs_review while the admin saw a success message.
    const { error: xErr } = await sb
      .from("appointment_extractions")
      .update({
        status: corrected ? "corrected" : "verified",
        verified_exam_at: examAt,
        verified_reporting_time: data.reportingTime,
        correction_reason: data.reason?.trim() || null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", e.id);
    if (xErr) return { error: "যাচাইয়ের ফলাফল সংরক্ষণ করা যায়নি" };
    return { ok: true };
  });
