import { addDays, todayStr, type Candidate, type Exam } from "./data";

export type RangeKey = "today" | "7d" | "30d" | "month" | "year" | "all" | "custom";
export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "আজ", "7d": "৭ দিন", "30d": "৩০ দিন", month: "এই মাস", year: "এই বছর", all: "সব", custom: "কাস্টম",
};

export function rangeBounds(key: RangeKey, from?: string, to?: string): [string, string] | null {
  const t = todayStr();
  switch (key) {
    case "today": return [t, t];
    case "7d": return [addDays(t, -6), t];
    case "30d": return [addDays(t, -29), t];
    case "month": return [t.slice(0, 8) + "01", t.slice(0, 8) + "31"];
    case "year": return [t.slice(0, 4) + "-01-01", t.slice(0, 4) + "-12-31"];
    case "custom": return from && to ? [from, to] : null;
    default: return null;
  }
}

export function inRange(exams: Exam[], b: [string, string] | null) {
  return b ? exams.filter((e) => e.exam_date >= b[0] && e.exam_date <= b[1]) : exams;
}

export function stats(exams: Exam[], candidates: Candidate[]) {
  const t = todayStr();
  return {
    candidates: candidates.length,
    exams: exams.length,
    pending: exams.filter((e) => e.result === "PENDING" && e.exam_date <= t).length,
    pass: exams.filter((e) => e.result === "PASS").length,
    fail: exams.filter((e) => e.result === "FAIL").length,
    absent: exams.filter((e) => e.result === "ABSENT").length,
    upcoming: exams.filter((e) => e.exam_date >= t && e.result === "PENDING").length,
  };
}

export function groupCount<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function passRateBy(exams: Exam[], key: (e: Exam) => string) {
  const m = new Map<string, { pass: number; fail: number; total: number }>();
  exams.forEach((e) => {
    if (e.result !== "PASS" && e.result !== "FAIL") return;
    const k = key(e);
    const v = m.get(k) ?? { pass: 0, fail: 0, total: 0 };
    v.total++;
    if (e.result === "PASS") v.pass++; else v.fail++;
    m.set(k, v);
  });
  return [...m.entries()].map(([name, v]) => ({ name, ...v, rate: Math.round((v.pass / v.total) * 100) }));
}

export function monthly(exams: Exam[]) {
  const m = new Map<string, { month: string; count: number; pass: number; decided: number }>();
  exams.forEach((e) => {
    const k = e.exam_date.slice(0, 7);
    const v = m.get(k) ?? { month: k, count: 0, pass: 0, decided: 0 };
    v.count++;
    if (e.result === "PASS" || e.result === "FAIL") v.decided++;
    if (e.result === "PASS") v.pass++;
    m.set(k, v);
  });
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month)).map((v) => ({ ...v, rate: v.decided ? Math.round((v.pass / v.decided) * 100) : 0 }));
}

export function byDate(exams: Exam[]) {
  return groupCount(exams, (e) => e.exam_date).sort((a, b) => a.name.localeCompare(b.name));
}

export function repeatCounts(exams: Exam[]) {
  const per = new Map<string, number>();
  exams.forEach((e) => per.set(e.candidate_id, (per.get(e.candidate_id) ?? 0) + 1));
  const dist = new Map<number, number>();
  per.forEach((n) => dist.set(n, (dist.get(n) ?? 0) + 1));
  return { per, dist: [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => ({ name: `${n} বার`, value: c })) };
}
