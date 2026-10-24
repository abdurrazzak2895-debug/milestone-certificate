import { svpErrorMessage } from "@/lib/svp-session.shared";

export type SvpLanguage = {
  code: string;
  label: string;
  questionCount: number | null;
};

export type SvpOccupation = {
  id: number;
  name: string;
  arabicName: string | null;
  occupationKey: string | null;
  categoryId: number | null;
  categoryName: string | null;
  languages: SvpLanguage[];
  driverLicenseRequired: boolean;
};

export type SvpCity = { city: string; countryId: number | null };

export type SvpBookingPermissions = {
  freeReservations: boolean;
  targeted: boolean;
  countryId: number | null;
  countryName: string | null;
};

export type SvpAvailableDate = {
  startAt: string;
  city: string | null;
  centerName: string | null;
};

export type SvpExamSession = {
  id: number;
  startAt: string;
  endAt: string | null;
  duration: number;
  availableSeats: number | null;
  city: string | null;
  centerName: string | null;
  siteId: number | null;
};

export type SvpEligibilityKey =
  "passport_expiration_condition" | "booking_availability_condition" | "already_existing_booking";

export type SvpEligibility = {
  key: SvpEligibilityKey;
  label: string;
  passed: boolean;
  message: string;
};

export type SvpReservation = {
  id: string;
  status: string | null;
  occupationName: string | null;
  city: string | null;
  centerName: string | null;
  startAt: string | null;
  methodology: string | null;
};

export type SvpCreateReservationInput = {
  examSessionId: number;
  occupationId: number;
  languageCode: string;
  duration: number;
  startAt: string;
  siteId: number | null;
  siteCity: string | null;
  holdId: string | null;
  countryId: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Find a list under the root or a `data` envelope. */
function pickList(payload: unknown, keys: string[]): unknown[] {
  const root = asRecord(payload);
  if (!root) return [];
  const data = asRecord(root["data"]);
  for (const source of [root, data]) {
    if (!source) continue;
    for (const key of keys) {
      const candidate = asArray(source[key]);
      if (candidate.length > 0) return candidate;
    }
  }
  for (const key of keys) {
    const candidate = asArray(root[key]);
    if (candidate.length > 0) return candidate;
  }
  return [];
}

function pickRecord(payload: unknown, key: string): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) return null;
  return asRecord(root[key]) ?? asRecord(asRecord(root["data"])?.[key]);
}

export function parseSvpOccupations(payload: unknown): SvpOccupation[] {
  return pickList(payload, ["occupations", "categories"])
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) return null;
      const id = number(record["id"]);
      const category = asRecord(record["category"]);
      if (id === null) return null;
      const categoryId = number(record["category_id"]) ?? number(category?.["id"]);
      const languages: SvpLanguage[] = [];
      for (const code of asArray(category?.["prometric_codes"])) {
        const item = asRecord(code);
        const languageCode = text(item?.["code"]);
        if (!item || !languageCode || languages.some((entry) => entry.code === languageCode)) {
          continue;
        }
        languages.push({
          code: languageCode,
          label: text(item["name"]) ?? text(item["english_name"]) ?? languageCode.toUpperCase(),
          questionCount: number(item["question_count"]),
        });
      }
      return {
        id,
        name: text(record["name"]) ?? text(record["english_name"]) ?? `Occupation ${String(id)}`,
        arabicName: text(record["arabic_name"]),
        occupationKey: text(record["occupation_key"]),
        categoryId,
        categoryName: text(category?.["name"]) ?? text(category?.["english_name"]),
        languages,
        driverLicenseRequired: Boolean(record["driver_license_required"]),
      };
    })
    .filter((entry): entry is SvpOccupation => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseSvpCities(payload: unknown): SvpCity[] {
  const seen = new Set<string>();
  const cities: SvpCity[] = [];
  for (const entry of pickList(payload, ["cities", "test_center_cities"])) {
    const record = asRecord(entry);
    if (!record) continue;
    const city = text(record["city"]) ?? text(record["name"]);
    if (!city || seen.has(city.toLowerCase())) continue;
    seen.add(city.toLowerCase());
    const country = asRecord(record["country"]);
    cities.push({
      city,
      countryId: number(record["country_id"]) ?? number(country?.["id"]),
    });
  }
  return cities.sort((a, b) => a.city.localeCompare(b.city));
}

export function parseSvpPermissions(payload: unknown): SvpBookingPermissions {
  const root = asRecord(payload);
  const country = asRecord(root?.["country"]) ?? asRecord(asRecord(root?.["data"])?.["country"]);
  return {
    freeReservations: Boolean(country?.["free_reservations"]),
    targeted: Boolean(country?.["targeted"]),
    countryId: number(country?.["id"]),
    countryName: text(country?.["english_name"]) ?? text(country?.["name"]),
  };
}

export function parseSvpCredits(payload: unknown): number {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]);
  return (
    number(root?.["reservation_credits"]) ??
    number(data?.["reservation_credits"]) ??
    number(root?.["credits"]) ??
    0
  );
}

export function parseSvpAvailableDates(payload: unknown): SvpAvailableDate[] {
  const seen = new Set<string>();
  const dates: SvpAvailableDate[] = [];
  for (const entry of pickList(payload, ["available_dates"])) {
    const record = asRecord(entry);
    if (!record) continue;
    const startAt =
      text(record["start_at_in_tc_time_zone"]) ??
      text(record["start_date_in_tc_time_zone"]) ??
      text(record["start_date_in_browser_time_zone"]) ??
      text(record["start_at"]);
    if (!startAt) continue;
    const center = asRecord(record["test_center"]);
    const key = `${startAt}|${text(center?.["city"]) ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dates.push({
      startAt,
      city: text(center?.["city"]) ?? text(record["city"]),
      centerName: text(center?.["name"]) ?? text(center?.["test_center_name"]),
    });
  }
  return dates.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function parseSvpExamSessions(payload: unknown): SvpExamSession[] {
  return pickList(payload, ["exam_sessions", "sessions"])
    .map((entry) => {
      const record = asRecord(entry);
      const id = number(record?.["id"]);
      if (!record || id === null) return null;
      const center = asRecord(record["test_center"]);
      return {
        id,
        startAt:
          text(record["startDateTime"]) ??
          text(record["start_at"]) ??
          text(record["start_at_in_tc_time_zone"]) ??
          "",
        endAt: text(record["end_at"]) ?? text(record["end_at_in_tc_time_zone"]),
        duration: number(record["duration"]) ?? 0,
        availableSeats: number(record["available_seats"]),
        city: text(center?.["city"]) ?? text(record["city"]),
        centerName: text(center?.["name"]) ?? text(center?.["test_center_name"]),
        siteId: number(record["site_id"]),
      };
    })
    .filter((entry): entry is SvpExamSession => entry !== null)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function buildSvpReservationBody(input: SvpCreateReservationInput) {
  return {
    exam_session_id: input.examSessionId,
    occupation_id: input.occupationId,
    language_code: input.languageCode,
    site_id: input.siteId ?? null,
    site_city: input.siteCity ?? null,
    hold_id: input.holdId ?? null,
    duration: input.duration,
    start_at: input.startAt,
    country_id: input.countryId ?? null,
  };
}

export function parseSvpReservation(payload: unknown): {
  id: string | null;
  status: string | null;
} {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]) ?? root;
  const reservation = asRecord(data?.["reservation"]) ?? data;
  const idValue = reservation?.["id"] ?? data?.["id"];
  return {
    id: idValue === undefined || idValue === null ? null : String(idValue),
    status: text(reservation?.["reservation_status"]) ?? text(reservation?.["status"]),
  };
}

export function parseSvpReservations(payload: unknown): SvpReservation[] {
  return pickList(payload, ["exam_reservations", "reservations"])
    .map((entry) => {
      const record = asRecord(entry);
      const id = record?.["id"];
      if (!record || id === undefined || id === null) return null;
      const occupation = asRecord(record["occupation"]);
      const session = asRecord(record["exam_session"]);
      const center = asRecord(session?.["test_center"]);
      return {
        id: String(id),
        status: text(record["reservation_status"]) ?? text(record["status"]),
        occupationName: text(occupation?.["name"]) ?? text(occupation?.["english_name"]),
        city: text(center?.["city"]),
        centerName: text(center?.["name"]),
        startAt: text(session?.["start_at_in_tc_time_zone"]) ?? text(session?.["start_at"]),
        methodology: text(record["methodology"]),
      };
    })
    .filter((entry): entry is SvpReservation => entry !== null);
}

/** Provider message for a failed response, never leaking values. */
export function parseSvpError(payload: unknown): string | null {
  return svpErrorMessage(payload);
}
