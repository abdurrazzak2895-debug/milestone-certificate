import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const API = "https://svp-international-api.pacc.sa/api/v1/visitor_space";
const HEADERS = {
  Origin: "https://svp-international.pacc.sa",
  Referer: "https://svp-international.pacc.sa/",
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
};
export const BANGLADESH_CODE = "BGD";

export type SvpOccupation = { key: string; name: string; arabic: string };
export type SvpCheck =
  | { status: "found"; result: "PASS" | "FAIL" | "PENDING"; examDate: string | null; applicantName: string | null; occupation: string | null }
  | { status: "not_found" | "error"; message: string };

export const listSvpOccupations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SvpOccupation[]> => {
    const out: SvpOccupation[] = [];
    for (let page = 1; page <= 10; page++) {
      const r = await fetch(`${API}/occupations?per_page=100&page=${page}&locale=en`, { headers: HEADERS });
      if (!r.ok) break;
      const j = (await r.json()) as { occupations?: { occupation_key: string; english_name: string; arabic_name: string }[]; pagination?: { next: number | null } };
      for (const o of j.occupations ?? []) out.push({ key: o.occupation_key, name: o.english_name, arabic: o.arabic_name });
      if (!j.pagination?.next) break;
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });

const MAP: Record<string, "PASS" | "FAIL" | "PENDING"> = { passed: "PASS", failed: "FAIL", pending: "PENDING" };

export const checkSvpResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ passport: z.string().trim().min(5).max(20).regex(/^[A-Za-z0-9]+$/), occupationKey: z.string().regex(/^\d{4,8}$/) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<SvpCheck> => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) return { status: "error", message: "অনুমতি নেই" };
    const qs = new URLSearchParams({ passport_number: data.passport.toUpperCase(), occupation_key: data.occupationKey, nationality_id: BANGLADESH_CODE, locale: "en" });
    try {
      const r = await fetch(`${API}/labors?${qs}`, { headers: HEADERS });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.status === 404 || j.error) return { status: "not_found", message: "SVP-তে কোনো রেজাল্ট পাওয়া যায়নি" };
      if (!r.ok) return { status: "error", message: "SVP সার্ভারে সমস্যা, পরে চেষ্টা করুন" };
      const rec = ((j.labor ?? j.data ?? (Array.isArray(j.labors) ? j.labors[0] : null) ?? j) as Record<string, unknown>) || {};
      const raw = String(rec.exam_result ?? "").toLowerCase();
      const result = MAP[raw];
      if (!result) return { status: "not_found", message: "SVP-তে কোনো রেজাল্ট পাওয়া যায়নি" };
      const nameOf = (v: unknown) => (v && typeof v === "object" ? String((v as Record<string, unknown>).english_name ?? (v as Record<string, unknown>).name ?? "") : v ? String(v) : null);
      return {
        status: "found",
        result,
        examDate: rec.exam_date ? String(rec.exam_date).slice(0, 10) : null,
        applicantName: rec.applicant_name ? String(rec.applicant_name) : null,
        occupation: nameOf(rec.occupation),
      };
    } catch (e) {
      console.error("SVP check failed", e);
      return { status: "error", message: "SVP সার্ভারে সংযোগ করা যায়নি" };
    }
  });
