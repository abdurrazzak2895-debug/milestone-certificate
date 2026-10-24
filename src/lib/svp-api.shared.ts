import { svpErrorMessage } from "@/lib/svp-session.shared";

export type SvpLanguage = {
  code: string;
  label: string;
  questionCount: number | null;
  /** Prometric codes are either targeted (false) or site-based (true). */
  nonTargeted: boolean;
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
  loadBalancer: boolean;
  countryId: number | null;
  countryName: string | null;
};

export type SvpAvailableDate = {
  startAt: string;
  city: string | null;
  centerName: string | null;
};

export type SvpExamSession = {
  id: string | number;
  startAt: string;
  endAt: string | null;
  duration: number;
  availableSeats: number | null;
  city: string | null;
  centerName: string | null;
  siteId: number | null;
};

export type SvpPrometricSite = {
  siteId: number;
  name: string | null;
  city: string | null;
  address: string | null;
  dates: string[];
};

export type SvpPrometricSiteList = { examId: string | null; sites: SvpPrometricSite[] };

export type SvpPrometricSlot = {
  id: string;
  siteId: number | null;
  startAt: string;
  duration: number;
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
  laborName: string | null;
  occupationName: string | null;
  occupationEnglishName: string | null;
  city: string | null;
  centerName: string | null;
  startAt: string | null;
  methodology: string | null;
  canBeRescheduled: boolean;
  categoryId: number | null;
  examSessionId: string | number | null;
  duration: number | null;
  languageCode: string | null;
};

export type SvpReservationDetail = SvpReservation & {
  occupationId: number | null;
  categoryName: string | null;
  languages: SvpLanguage[];
  countryId: number | null;
};

export type SvpConstraints = {
  rescheduleTimes: number;
  bookingHoldSeconds: number;
  cancellationLimitHours: number | null;
};

export type SvpFeatureFlags = {
  rescheduleEnabled: boolean;
  creditsEnabled: boolean;
};

export type SvpAccountPermissions = SvpBookingPermissions & {
  permissionKeys: string[];
};

export type SvpCreateReservationInput = {
  examSessionId: number | string;
  occupationId: number;
  languageCode: string;
  duration?: number | null;
  startAt?: string | null;
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
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  if (!root) return [];
  const data = asRecord(root["data"]);
  if (Array.isArray(root["data"])) return root["data"];
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

function parseLanguages(category: Record<string, unknown> | null): SvpLanguage[] {
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
      nonTargeted: Boolean(item["non_targeted"]),
    });
  }
  return languages;
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
      const languages = parseLanguages(category);
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
    loadBalancer: Boolean(country?.["load_balancer"]),
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
      const idValue = record?.["id"];
      if (!record || idValue === undefined || idValue === null) return null;
      const id = typeof idValue === "number" ? idValue : String(idValue);
      const center = asRecord(record["test_center"]);
      return {
        id,
        startAt:
          text(record["startDateTime"]) ??
          text(record["start_at"]) ??
          text(record["start_at_in_tc_time_zone"]) ??
          text(record["start_date_in_tc_time_zone"]) ??
          text(record["start_date_in_browser_time_zone"]) ??
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
  const body: Record<string, unknown> = {
    exam_session_id: input.examSessionId,
    occupation_id: input.occupationId,
    language_code: input.languageCode,
    site_id: input.siteId ?? null,
    site_city: input.siteCity ?? null,
    hold_id: input.holdId ?? null,
    country_id: input.countryId ?? null,
  };
  // Load-balancer sessions are date-only tokens; the portal omits these fields.
  if (input.duration !== null && input.duration !== undefined) body["duration"] = input.duration;
  if (input.startAt) body["start_at"] = input.startAt;
  return body;
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
      const labor = asRecord(record["labor"]) ?? asRecord(record["individual_labor"]);
      const session = asRecord(record["exam_session"]);
      const center = asRecord(session?.["test_center"]) ?? asRecord(record["test_center"]);
      return {
        id: String(id),
        status: text(record["reservation_status"]) ?? text(record["status"]),
        laborName: text(labor?.["full_name"]) ?? text(labor?.["name"]),
        occupationName: text(occupation?.["name"]) ?? text(occupation?.["english_name"]),
        occupationEnglishName: text(occupation?.["english_name"]),
        city: text(center?.["city"]),
        centerName: text(center?.["name"]),
        startAt: text(session?.["start_at_in_tc_time_zone"]) ?? text(session?.["start_at"]),
        methodology: text(record["methodology"]),
        canBeRescheduled: Boolean(record["can_be_rescheduled"]),
        categoryId: number(record["category_id"]) ?? number(asRecord(record["category"])?.["id"]),
        examSessionId:
          typeof session?.["id"] === "string" ? session["id"] : (number(session?.["id"]) ?? null),
        duration: number(session?.["duration"]) ?? number(record["duration"]),
        languageCode: text(record["language_code"]),
      };
    })
    .filter((entry): entry is SvpReservation => entry !== null);
}

/** Provider message for a failed response, never leaking values. */
export function parseSvpError(payload: unknown): string | null {
  return svpErrorMessage(payload);
}

/** Safe download name: `<Candidate>_<Occupation English>_SVP_Ticket.pdf`. */
export function svpTicketFileName(
  name: string | null | undefined,
  occupationEnglishName: string | null | undefined,
): string {
  const slug = (value: string | null | undefined, fallback: string) => {
    const cleaned = (value ?? "")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s/g, "_")
      .slice(0, 80);
    return cleaned || fallback;
  };
  return `${slug(name, "Candidate")}_${slug(occupationEnglishName, "Occupation")}_SVP_Ticket.pdf`;
}

/** Reservation detail used by the reschedule flow. */
export function parseSvpReservationDetail(payload: unknown): SvpReservationDetail | null {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]) ?? root;
  const reservation = asRecord(data?.["reservation"]) ?? data;
  if (!reservation) return null;
  const idValue = reservation["id"] ?? data?.["id"];
  if (idValue === undefined || idValue === null) return null;

  const session = asRecord(reservation["exam_session"]);
  const category =
    asRecord(reservation["category"]) ??
    asRecord(session?.["category"]) ??
    asRecord(asRecord(reservation["occupation"])?.["category"]);
  const occupation = asRecord(reservation["occupation"]);
  const center = asRecord(session?.["test_center"]) ?? asRecord(reservation["test_center"]);
  const labor = asRecord(reservation["labor"]) ?? asRecord(reservation["individual_labor"]);

  return {
    id: String(idValue),
    status: text(reservation["reservation_status"]) ?? text(reservation["status"]),
    laborName: text(labor?.["full_name"]) ?? text(labor?.["name"]),
    occupationName: text(occupation?.["name"]) ?? text(occupation?.["english_name"]),
    occupationEnglishName: text(occupation?.["english_name"]),
    city: text(center?.["city"]),
    centerName: text(center?.["name"]),
    startAt: text(session?.["start_at_in_tc_time_zone"]) ?? text(session?.["start_at"]),
    methodology: text(reservation["methodology"]),
    canBeRescheduled: Boolean(reservation["can_be_rescheduled"]),
    categoryId: number(reservation["category_id"]) ?? number(category?.["id"]),
    examSessionId:
      typeof session?.["id"] === "string" ? session["id"] : (number(session?.["id"]) ?? null),
    duration: number(session?.["duration"]) ?? number(reservation["duration"]),
    occupationId: number(reservation["occupation_id"]) ?? number(occupation?.["id"]),
    categoryName: text(category?.["name"]) ?? text(category?.["english_name"]),
    languages: parseLanguages(category),
    languageCode: text(reservation["language_code"]),
    countryId:
      number(reservation["country_id"]) ?? number(asRecord(reservation["country"])?.["id"]),
  };
}

/** `/exam_constraints` values that gate booking and rescheduling. */
export function parseSvpConstraints(payload: unknown): SvpConstraints {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]) ?? root;
  return {
    rescheduleTimes: number(data?.["reservation_rescheduling"]) ?? 1,
    bookingHoldSeconds: number(data?.["reservation_duration"]) ?? 0,
    cancellationLimitHours:
      number(data?.["labor_reservation_cancellation_time_limit"]) ??
      number(data?.["labor_reservation_cancellation_limit"]),
  };
}

/** Flipper flags relevant to booking/rescheduling (`[{name, state}]` or a map). */
export function parseSvpFeatureFlags(payload: unknown): SvpFeatureFlags {
  const root = asRecord(payload);
  const container =
    root?.["feature_flags"] ??
    asRecord(root?.["data"])?.["feature_flags"] ??
    root?.["data"] ??
    root;

  const isOn = (value: unknown) =>
    value === true || value === "true" || value === 1 || value === "1";

  const lookup = (name: string): boolean => {
    if (Array.isArray(container)) {
      const entry = container
        .map(asRecord)
        .find((item) => item && String(item["name"] ?? "").toLowerCase() === name.toLowerCase());
      return entry ? isOn(entry["state"]) : false;
    }
    const record = asRecord(container);
    if (!record) return false;
    const key = Object.keys(record).find((entry) => entry.toLowerCase() === name.toLowerCase());
    return key ? isOn(record[key]) : false;
  };

  return {
    rescheduleEnabled: lookup("enable_labor_rescheduling_flow"),
    creditsEnabled: lookup("labor_reservation_credits"),
  };
}

function collectTrueKeys(value: unknown, depth = 0, keys: string[] = []): string[] {
  if (depth > 4 || !value || typeof value !== "object" || Array.isArray(value)) return keys;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === true) keys.push(key);
    else collectTrueKeys(entry, depth + 1, keys);
  }
  return keys.slice(0, 40);
}

/** Country permissions plus the true boolean permission keys of the labor role. */
export function parseSvpAccountPermissions(payload: unknown): SvpAccountPermissions {
  const permissions = parseSvpPermissions(payload);
  const root = asRecord(payload);
  const raw = asRecord(root?.["permissions"]);
  const legislator = asRecord(raw?.["legislator"]) ?? raw;
  const labors = asRecord(legislator?.["labors"]);
  return {
    ...permissions,
    permissionKeys: collectTrueKeys(labors ?? legislator),
  };
}

/** Site availability list from `/prometric_scheduling/sites_availabilities`. */
export function parseSvpPrometricSites(payload: unknown): SvpPrometricSiteList {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]) ?? root;
  const sites: SvpPrometricSite[] = [];
  for (const entry of asArray(data?.["sites"])) {
    const record = asRecord(entry);
    const siteId = number(record?.["site_id"]) ?? number(record?.["id"]);
    if (!record || siteId === null) continue;
    const center = asRecord(record["test_center"]);
    const address = asRecord(center?.["address"]);
    const dates = asArray(record["available_dates"])
      .map((value) => {
        if (typeof value === "string") return value.slice(0, 10);
        const item = asRecord(value);
        return (text(item?.["date"]) ?? text(item?.["start_at"]) ?? "").slice(0, 10);
      })
      .filter((value) => Boolean(value));
    sites.push({
      siteId,
      name: text(center?.["name"]) ?? text(record["site_name"]),
      city: text(address?.["locality"]) ?? text(center?.["city"]) ?? text(record["city"]),
      address: text(address?.["formattedAddress"]) ?? text(record["address"]),
      dates: [...new Set(dates)],
    });
  }
  return {
    examId: text(data?.["exam_id"]) ?? text(root?.["exam_id"]),
    sites,
  };
}

/** Slot list from `/prometric_scheduling/slots_availabilities` (`[{site_id, slots}]`). */
export function parseSvpPrometricSlots(payload: unknown): SvpPrometricSlot[] {
  let groups: unknown[] = [];
  if (Array.isArray(payload)) {
    groups = payload;
  } else {
    const root = asRecord(payload);
    if (root) {
      if (Array.isArray(root["data"])) groups = root["data"];
      else {
        const data = asRecord(root["data"]);
        for (const candidate of [root["slots"], data?.["slots"], data?.["sites"]]) {
          if (Array.isArray(candidate)) {
            groups = candidate;
            break;
          }
        }
      }
    }
  }

  const slots: SvpPrometricSlot[] = [];
  for (const entry of groups) {
    const group = asRecord(entry);
    if (!group) continue;
    const siteId = number(group["site_id"]);
    for (const value of asArray(group["slots"])) {
      const slot = asRecord(value);
      const id = slot?.["id"];
      const startAt =
        text(slot?.["startDateTime"]) ??
        text(slot?.["start_at"]) ??
        text(slot?.["start_at_in_tc_time_zone"]);
      if (!slot || id === undefined || id === null || !startAt) continue;
      slots.push({
        id: String(id),
        siteId: number(slot["site_id"]) ?? siteId,
        startAt,
        duration: number(slot["duration"]) ?? 0,
      });
    }
  }
  return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** One exam session by id (load-balancer assignment response). */
export function parseSvpExamSession(payload: unknown): SvpExamSession | null {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]) ?? root;
  return parseSvpExamSessions({ exam_sessions: [data] })[0] ?? null;
}
