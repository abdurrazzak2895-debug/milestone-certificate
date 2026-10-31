type RecordValue = Record<string, unknown>;

export type OccupationChoice = {
  optionId: string;
  categoryId: string;
  label: string;
  category: string | null;
  /** Languages reported by Takamol for this occupation, when provided. */
  languages?: string[];
  /** Takamol's occupation-specific language code used for the exam booking. */
  languageCode?: string;
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
    const languages = occupationLanguages(row);
    const languageCode = firstText(row, ["language_code", "languageCode"]);
    return [
      {
        optionId,
        categoryId,
        label,
        category: category && category !== label ? category : null,
        ...(languages.length > 0 ? { languages } : {}),
        ...(languageCode ? { languageCode } : {}),
      },
    ];
  });
}

/**
 * Occupation id → Takamol language code. The occupations endpoint returns
 * `{ occupation_id, id (category), language_code }` for every bookable occupation.
 */
export function parseOccupationLanguages(
  payload: unknown,
): { occupationId: string; occupationKey: string | null; languageCode: string }[] {
  return rowsAt(payload, ["occupations"]).flatMap((row) => {
    const occupationId = firstText(row, ["occupation_id", "occupationId"]);
    const languageCode = firstText(row, ["language_code", "languageCode"]);
    return occupationId && languageCode
      ? [
          {
            occupationId,
            occupationKey: firstText(row, ["occupation_key", "occupationKey"]),
            languageCode,
          },
        ]
      : [];
  });
}

/** Language labels/codes reported by Takamol on the occupation or its category. */
function occupationLanguages(row: RecordValue): string[] {
  const names = new Set<string>();
  for (const key of [
    "languages",
    "language_names",
    "exam_languages",
    "language_codes",
    "prometric_codes",
    "language",
    "language_name",
  ]) {
    const value = row[key];
    const entries = Array.isArray(value) ? value : value === undefined ? [] : [value];
    for (const entry of entries) {
      if (typeof entry === "string" && entry.trim()) {
        names.add(entry.trim());
        continue;
      }
      const record = asRecord(entry);
      const text = firstText(record ?? {}, ["name", "label", "language_name", "language", "code"]);
      if (text) names.add(text);
    }
  }
  return [...names].slice(0, 8);
}

export function parseCities(payload: unknown): string[] {
  const record = asRecord(payload);
  const source = record?.["cities"];
  if (!Array.isArray(source)) return [];

  const unique = new Map<string, string>();
  for (const item of source) {
    const value =
      typeof item === "string"
        ? item.trim()
        : firstText(asRecord(item) ?? {}, ["city", "city_name", "name"]);
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
    const id = firstText(row, ["test_center_id", "center_id", "site_id", "id", "center"]);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const label =
      firstText(row, ["name", "center_name", "test_center_name", "site_name", "title"]) ??
      `Test center ${id}`;
    const location = firstText(row, ["city", "division", "raw_city", "location"]);
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

export type TakamolRescheduleRow = {
  id: string;
  centerId: string | null;
  svpSiteId: string | null;
  svpSlotId: string | null;
  centerName: string | null;
  city: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  seats: number | null;
  language: string | null;
  available: boolean;
};

export type TakamolSlotMapping = {
  row: TakamolRescheduleRow;
  slot: { id: string; siteId: number | null; startAt: string; duration: number } | null;
  reason: "unavailable" | "date-mismatch" | "identity-missing" | "no-match" | "ambiguous" | null;
};

function numberValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateKey(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1] ?? null;
}

function timeKey(value: string | null): string | null {
  if (!value) return null;
  const input = value.trim();
  const match = /(?:^|[T ])(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(input);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minutes > 59 || hours > (meridiem ? 12 : 23) || hours < 0) return null;
  if (meridiem) {
    if (hours < 1) return null;
    if (meridiem === "AM" && hours === 12) hours = 0;
    if (meridiem === "PM" && hours !== 12) hours += 12;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function identityKey(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bcentre\b/g, "center")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function firstTextIn(records: Array<RecordValue | null>, keys: string[]): string | null {
  for (const record of records) {
    if (!record) continue;
    const value = firstText(record, keys);
    if (value) return value;
  }
  return null;
}

function firstValueIn(records: Array<RecordValue | null>, keys: string[]): unknown {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null) return record[key];
    }
  }
  return undefined;
}

/** Parse Takamol session rows while retaining only fields needed for safe SVP-slot matching. */
export function parseTakamolRescheduleRows(
  payload: unknown,
  centers: TestCenterChoice[] = [],
  fallbackCity: string | null = null,
  fallbackDate: string | null = null,
): TakamolRescheduleRow[] {
  return parseSessions(payload).map((row, index) => {
    const nestedSession = asRecord(row["session"]) ?? asRecord(row["slot_details"]);
    const nestedCenter =
      asRecord(row["test_center"]) ?? asRecord(row["site"]) ?? asRecord(row["center"]);
    const records = [row, nestedSession ?? null, nestedCenter ?? null];
    const centerId = firstTextIn(records, ["test_center_id", "center_id", "centerId"]);
    const center = centers.find((entry) => entry.id === centerId);
    const dateTime = firstTextIn(records, [
      "start_at",
      "startAt",
      "startDateTime",
      "start_at_in_tc_time_zone",
      "start_date_in_tc_time_zone",
      "start_date_in_browser_time_zone",
    ]);
    const date =
      dateKey(
        firstTextIn(records, ["exam_date", "test_date", "session_date", "date"]) ?? dateTime,
      ) ?? fallbackDate;
    const time =
      firstTextIn(records, [
        "exam_time",
        "examTime",
        "session_time",
        "sessionTime",
        "start_time",
        "startTime",
        "start_time_in_tc_time_zone",
        "test_center_time",
        "time",
        "slot_time",
        "slotTime",
      ]) ?? (dateTime && /[T ]\d{1,2}:\d{2}/.test(dateTime) ? dateTime : null);
    const rawStatus = firstTextIn(records, [
      "availability_status",
      "exam_slot_status",
      "exam_slot",
      "slot_status",
      "availability",
      "status",
    ]);
    const rawAvailable = firstValueIn(records, ["is_available", "isAvailable", "available"]);
    const rawSeats = firstValueIn(records, [
      "available_seats",
      "availableSeats",
      "seats_available",
      "seatsAvailable",
      "remaining_seats",
      "remainingSeats",
      "free_seats",
      "seats",
    ]);
    const seats = numberValue(rawSeats);
    const status = rawStatus?.trim() ?? null;
    const explicitAvailable = typeof rawAvailable === "boolean" ? rawAvailable : null;
    const unavailableStatus = Boolean(
      status &&
      /\b(full|closed|unavailable|not available|booked|cancelled|sold out)\b/i.test(status),
    );
    const available =
      explicitAvailable ?? (unavailableStatus ? false : seats !== null ? seats > 0 : true);
    const tableRow = parseSessionTableRows([row])[0];

    return {
      id:
        firstTextIn(records, ["availability_id", "session_id", "exam_session_id", "id"]) ??
        `${index}-${centerId ?? center?.id ?? "center"}`,
      centerId,
      svpSiteId: firstTextIn(records, ["svp_site_id", "prometric_site_id", "site_id"]),
      svpSlotId: firstTextIn(records, ["svp_slot_id", "prometric_slot_id"]),
      centerName:
        firstTextIn(
          [row],
          ["center_name", "test_center_name", "site_name", "centerName", "testCenterName"],
        ) ??
        firstTextIn(
          [nestedCenter ?? null],
          ["center_name", "test_center_name", "site_name", "centerName", "testCenterName", "name"],
        ) ??
        firstTextIn([nestedSession ?? null], ["center_name", "test_center_name", "site_name"]) ??
        center?.label ??
        tableRow?.centerName ??
        null,
      city:
        firstTextIn(records, ["city", "division", "raw_city"]) ?? center?.location ?? fallbackCity,
      date,
      time,
      status,
      seats,
      language: tableRow?.language ?? null,
      available,
    };
  });
}

/** Match Takamol availability to SVP slots by exact identity/date/time, never by row order. */
export function mapTakamolRowsToSvpSlots(
  rows: TakamolRescheduleRow[],
  sites: Array<{ siteId: number; name: string | null; city: string | null }>,
  slots: Array<{ id: string; siteId: number | null; startAt: string; duration: number }>,
  selectedCity: string,
  selectedDate: string,
): TakamolSlotMapping[] {
  const tentative = rows.map((row): TakamolSlotMapping => {
    if (!row.available) return { row, slot: null, reason: "unavailable" };
    if (row.date && row.date !== selectedDate) return { row, slot: null, reason: "date-mismatch" };

    const city = identityKey(row.city ?? selectedCity);
    const centerName = identityKey(row.centerName);
    const normalizedTime = timeKey(row.time);
    const explicitSiteId = numberValue(row.svpSiteId);
    if (!row.svpSlotId && explicitSiteId === null && (!centerName || !normalizedTime)) {
      return { row, slot: null, reason: "identity-missing" };
    }

    const matches = slots.filter((slot) => {
      if (row.svpSlotId && slot.id !== row.svpSlotId) return false;
      if (explicitSiteId !== null && slot.siteId !== explicitSiteId) return false;
      if (dateKey(slot.startAt) !== selectedDate) return false;
      if (normalizedTime && timeKey(slot.startAt) !== normalizedTime) return false;
      const site = sites.find((candidate) => candidate.siteId === slot.siteId);
      if (!site) return false;
      const siteCity = identityKey(site.city ?? selectedCity);
      if (city && siteCity && city !== siteCity) return false;
      if (centerName && identityKey(site.name) !== centerName) return false;
      if (!row.svpSlotId && explicitSiteId === null && !centerName) return false;
      return true;
    });

    if (matches.length === 1) return { row, slot: matches[0] ?? null, reason: null };
    return { row, slot: null, reason: matches.length > 1 ? "ambiguous" : "no-match" };
  });

  const selectedSlotCounts = new Map<string, number>();
  for (const entry of tentative) {
    if (entry.slot)
      selectedSlotCounts.set(entry.slot.id, (selectedSlotCounts.get(entry.slot.id) ?? 0) + 1);
  }
  return tentative.map((entry) =>
    entry.slot && (selectedSlotCounts.get(entry.slot.id) ?? 0) > 1
      ? { row: entry.row, slot: null, reason: "ambiguous" }
      : entry,
  );
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
