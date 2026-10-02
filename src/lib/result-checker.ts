/**
 * Result Checker service layer.
 * No official result API is connected yet. When an authorized official
 * endpoint becomes available, implement `fetchOfficialResult` here
 * (preferably via a server function so credentials stay private).
 */
import type { ExamResult } from "./data";

export type ResultQuery = { registrationNo: string; passportNo?: string; examNo?: string };
export type ResultCheckResponse =
  | { status: "unavailable"; message: string }
  | { status: "found"; result: ExamResult; score?: number | null; resultDate: string }
  | { status: "not_found"; message: string };

export const NOT_CONNECTED_MSG = "স্বয়ংক্রিয় রেজাল্ট চেক বর্তমানে সংযুক্ত নয়";

export async function checkOfficialResult(_q: ResultQuery, apiUrl?: string): Promise<ResultCheckResponse> {
  if (!apiUrl) return { status: "unavailable", message: NOT_CONNECTED_MSG };
  // Placeholder: an official endpoint has not been integrated yet.
  return { status: "unavailable", message: NOT_CONNECTED_MSG };
}
