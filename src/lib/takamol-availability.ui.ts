type RecordValue = Record<string, unknown>;

export type OccupationChoice = {
  optionId: string;
  categoryId: string;
  label: string;
  category: string | null;
};

export type TestCenterChoice = {
  id: string;
  label: string;
  location: string | null;
};

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function toText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function firstText(record: RecordValue, keys: string[]): string | null {
  for (const key of keys) {
    const text = toText(record[key]);
    if (text) return text;
  }
  return null;
}

function rowsAt(payload: unknown, keys: string[]): RecordValue[] {
  if (Array.isArray(payload))
    return payload.map(asRecord).filter((row): row is RecordValue => !!row);
  const record = asRecord(payload);
  if (!record) return [];

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map(asRecord).filter((row): row is RecordValue => !!row);
    }
  }
  return [];
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function parseOccupations(payload: unknown): OccupationChoice[] {
  const seen = new Set<string>();
  return rowsAt(payload, ["occupations"]).flatMap((row) => {
    const categoryId = firstText(row, ["category_id", "id"]);
    const label = firstText(row, ["english_name", "name", "occupation_name", "category_name"]);
    if (!categoryId || !label) return [];

    const optionId =
      firstText(row, ["occupation_id", "occupation_key"]) ?? `${categoryId}:${label}`;
    if (seen.has(optionId)) return [];
    seen.add(optionId);
    const category = firstText(row, ["category_name"]);
    return [
      { optionId, categoryId, label, category: category && category !== label ? category : null },
    ];
  });
}

export function parseCities(payload: unknown): string[] {
  const record = asRecord(payload);
  const source = record?.["cities"];
  if (!Array.isArray(source)) return [];

  const unique = new Map<string, string>();
  for (const item of source) {
    const value =
      typeof item === "string" ? item.trim() : firstText(asRecord(item) ?? {}, ["city", "name"]);
    if (value && !unique.has(value.toLocaleLowerCase())) {
      unique.set(value.toLocaleLowerCase(), value);
    }
  }
  return [...unique.values()];
}

export function parseAvailableDates(payload: unknown): string[] {
  const record = asRecord(payload);
  if (!record) return [];
  const found = new Set<string>();
  for (const key of ["dates", "available_dates"]) {
    const values = record[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const date =
        typeof value === "string"
          ? value.trim()
          : firstText(asRecord(value) ?? {}, [
              "date",
              "test_center_date",
              "start_date_in_browser_time_zone",
              "start_date_in_tc_time_zone",
            ]);
      if (date && validIsoDate(date)) found.add(date);
    }
  }
  return [...found].sort();
}

export function parseTestCenters(payload: unknown): TestCenterChoice[] {
  const seen = new Set<string>();
  return rowsAt(payload, ["sites", "centers", "test_centers"]).flatMap((row) => {
    const id = firstText(row, ["test_center_id", "id", "center"]);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const label = firstText(row, ["name", "center_name", "title"]) ?? `Test center ${id}`;
    const location = firstText(row, ["city", "division", "raw_city"]);
    return [{ id, label, location }];
  });
}

export function parseSessions(payload: unknown): RecordValue[] {
  const record = asRecord(payload);
  if (!record) return rowsAt(payload, []);

  for (const key of ["sessions", "exam_sessions"]) {
    const rows = rowsAt(record, [key]);
    if (rows.length > 0) return rows;
  }

  return rowsAt(record, ["sites"]).flatMap((site) => {
    let nestedSessions: RecordValue[] = [];
    for (const key of ["sessions", "exam_sessions"]) {
      nestedSessions = rowsAt(site, [key]);
      if (nestedSessions.length > 0) break;
    }
    const centerName = firstText(site, ["center_name", "test_center_name", "name", "title"]);
    return nestedSessions.map((session) => ({
      ...session,
      center_name:
        firstText(session, ["center_name", "test_center_name", "site_name"]) ?? centerName,
    }));
  });
}

export function parseSessionTableRows(payload: unknown, fallbackCenterName?: string) {
  return parseSessions(payload).map((row, index) => {
    const center = asRecord(row["test_center"]) ?? asRecord(row["site"]) ?? asRecord(row["center"]);
    const session = asRecord(row["session"]) ?? asRecord(row["slot_details"]) ?? {};
    const centerName =
      firstText(row, [
        "center_name",
        "test_center_name",
        "site_name",
        "centerName",
        "testCenterName",
      ]) ??
      firstText(center ?? {}, ["name", "center_name", "test_center_name", "title"]) ??
      toText(row["center"]) ??
      fallbackCenterName ??
      "—";
    const slot =
      firstText(row, [
        "exam_slot",
        "exam_slot_status",
        "slot_name",
        "slot_status",
        "status",
        "availability_status",
        "availability",
      ]) ??
      firstText(session, ["exam_slot", "slot_name", "status", "availability"]) ??
      "Available";
    const examSlot = /^available$/i.test(slot) ? "Available" : slot;
    const examTime =
      firstText(row, [
        "exam_time",
        "examTime",
        "session_time",
        "sessionTime",
        "start_time",
        "startTime",
        "time",
        "slot_time",
        "slotTime",
        "time_slot",
        "timeSlot",
      ]) ??
      firstText(session, ["exam_time", "session_time", "start_time", "time", "slot_time"]) ??
      "—";
    const language =
      firstText(row, [
        "language_name",
        "languageName",
        "exam_language",
        "examLanguage",
        "session_language",
        "test_language",
        "language",
        "language_code",
        "languageCode",
        "lang",
      ]) ??
      firstText(session, [
        "language_name",
        "exam_language",
        "session_language",
        "test_language",
        "language",
        "language_code",
        "lang",
      ]) ??
      firstText(center ?? {}, ["language_name", "language"]);
    const seats =
      firstText(row, [
        "available_seats",
        "availableSeats",
        "seats_available",
        "seatsAvailable",
        "remaining_seats",
        "remainingSeats",
        "free_seats",
        "seats",
        "seat_count",
        "seatCount",
        "number_of_seats",
        "vacancies",
      ]) ??
      firstText(session, [
        "available_seats",
        "seats_available",
        "remaining_seats",
        "seats",
        "seat_count",
      ]) ??
      "—";
    const id =
      firstText(row, ["session_id", "exam_session_id", "id"]) ??
      `${index}-${centerName}-${examTime}`;

    return { id, centerName, examSlot, examTime, seats, language: normalizeLanguage(language) };
  });
}

const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  bn: "Bengali",
  en: "English",
  hi: "Hindi",
  ne: "Nepali",
  ur: "Urdu",
};

/** Language codes are shown as their full name; provider text is kept as-is. */
function normalizeLanguage(value: string | null): string | null {
  if (!value) return null;
  const code = value.trim().toLowerCase();
  return LANGUAGE_NAMES[code] ?? value.trim();
}

const PRIVATE_FIELD = /token|api[_-]?key|secret|password|authorization|cookie/i;

export function redactTakamolPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTakamolPayload);
  const record = asRecord(value);
  if (!record) return value;

  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !PRIVATE_FIELD.test(key))
      .map(([key, nested]) => [key, redactTakamolPayload(nested)]),
  );
}
