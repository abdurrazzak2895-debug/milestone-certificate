import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  LoaderCircle,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/app/ui-bits";
import { SvpLoginPanel } from "@/components/app/SvpLoginPanel";
import { SvpReschedulePanel } from "@/components/app/SvpReschedulePanel";
import {
  SvpExamSessionsTable,
  type SvpExamSessionView,
} from "@/components/app/SvpExamSessionsTable";
import { supabase } from "@/integrations/supabase/client";
import {
  checkSvpBookingEligibility,
  createSvpBooking,
  createSvpPrometricHold,
  createSvpTargetedHold,
  downloadSvpTicket,
  getSvpAccountOverview,
  getSvpBookingSetup,
  getSvpDiagnostics,
  getSvpOccupationById,
  getSvpExamSessionById,
  listSvpAvailableDates,
  listSvpBookingOccupations,
  listSvpExamSessions,
  listSvpPrometricSites,
  listSvpPrometricSlots,
  listSvpReservations,
  listSvpTestCenterCities,
  searchSvpOccupations,
  type SvpBookingResult,
  type SvpDiagnostics,
} from "@/lib/svp-booking.functions";
import { lookupTakamolAvailability } from "@/lib/takamol-availability.functions";
import { parseSessionTableRows } from "@/lib/takamol-availability.ui";
import {
  getSvpSessionStatus,
  listSvpAccounts,
  removeSvpAccount,
  signOutSvpSession,
  switchSvpAccount,
} from "@/lib/svp-session.functions";
import { svpTicketFileName } from "@/lib/svp-api.shared";
import type {
  SvpAvailableDate,
  SvpEligibility,
  SvpExamSession,
  SvpOccupation,
  SvpPrometricSlot,
  SvpReservation,
} from "@/lib/svp-api.shared";
import {
  normalizeSvpBookingForm,
  svpCandidateIdentitySchema,
  toSvpBookingInsert,
} from "@/lib/svp-booking.shared";
import { saveSvpLocalBookingRecord, type SvpLocalRecordPayload } from "@/lib/svp-local-record";

const SVP_PORTAL_BOOKING_URL = "https://svp-international.qiwa.sa/";
const SESSION_QUERY_KEY = ["svp-session-status"] as const;

function splitDateTime(value: string): { date: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  if (match) return { date: match[1] ?? "", time: match[2] ?? "" };
  return { date: value.slice(0, 10), time: "" };
}

function formatSlot(value: string): string {
  const { date, time } = splitDateTime(value);
  if (!date) return value;
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })}${time ? ` · ${time}` : ""}`;
}

function statusTone(status: string | null): string {
  if (!status) return "bg-muted text-muted-foreground";
  if (["reserved", "completed"].includes(status.toLowerCase())) {
    return "bg-success-soft text-success";
  }
  if (["canceled", "cancelled", "payment_failed"].includes(status.toLowerCase())) {
    return "bg-danger-soft text-danger";
  }
  return "bg-warning-soft text-warning";
}

type Stage = "select" | "dates" | "confirm" | "done";

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function formatHoldExpiry(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDateOnly(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function savePdfBase64(base64: string, contentType: string, fileName: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function BookingStepper({ stage }: { stage: Stage }) {
  const steps = [
    { key: "select", title: "Occupation & center", icon: BriefcaseBusiness },
    { key: "dates", title: "Date & session", icon: CalendarDays },
    { key: "confirm", title: "Confirm", icon: ShieldCheck },
  ] as const;
  const activeIndex = stage === "select" ? 0 : stage === "dates" ? 1 : stage === "confirm" ? 2 : 3;

  return (
    <ol className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card/80 p-2 backdrop-blur sm:flex-nowrap">
      {steps.map((step, index) => {
        const complete = activeIndex > index;
        const active = activeIndex === index;
        return (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                complete || active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {complete ? <CheckCircle2 className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                0{index + 1}
              </span>
              <span
                className={`block truncate text-xs font-semibold ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.title}
              </span>
            </span>
            {index < steps.length - 1 && (
              <ChevronRight className="ml-auto hidden h-4 w-4 text-muted-foreground/40 sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function SvpBookingWizard() {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => getSvpSessionStatus(),
    retry: false,
  });
  const status = sessionQuery.data;
  const accountsQuery = useQuery({
    queryKey: ["svp-accounts"],
    queryFn: () => listSvpAccounts(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const accounts = accountsQuery.data?.accounts ?? [];
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [forceTargeted, setForceTargeted] = useState(false);
  const [occupationLookup, setOccupationLookup] = useState(false);
  const [manualCategoryId, setManualCategoryId] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<SvpDiagnostics | null>(null);
  const autoCheckRef = useRef("");
  const selectionTokenRef = useRef(0);
  const occupationBoxRef = useRef<HTMLDivElement | null>(null);
  const signedIn = Boolean(status?.signedIn);

  const [stage, setStage] = useState<Stage>("select");
  const [occupationId, setOccupationId] = useState<number | null>(null);
  const [languageCode, setLanguageCode] = useState("");
  const [city, setCity] = useState("");
  const [cityCountryId, setCityCountryId] = useState<number | null>(null);
  const [occupationSearch, setOccupationSearch] = useState("");
  const [occupationOpen, setOccupationOpen] = useState(false);
  const [selectedOccupation, setSelectedOccupation] = useState<SvpOccupation | null>(null);
  const [eligibility, setEligibility] = useState<SvpEligibility[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [selectedDate, setSelectedDate] = useState<SvpAvailableDate | null>(null);
  const [selectedSession, setSelectedSession] = useState<SvpExamSession | null>(null);
  const [prometricDate, setPrometricDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SvpPrometricSlot | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [prometricHoldExpiresAt, setPrometricHoldExpiresAt] = useState<string | null>(null);
  const [targetedHoldExpiresAt, setTargetedHoldExpiresAt] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [passport, setPassport] = useState("");
  const [agency, setAgency] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [result, setResult] = useState<SvpBookingResult | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [localSaveStatus, setLocalSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );
  const localRecordRef = useRef<SvpLocalRecordPayload | null>(null);
  const localSaveBusyRef = useRef(false);
  const bookingSubmittedRef = useRef(false);
  const identityAccountRef = useRef<string | null>(null);
  const candidateValidation = svpCandidateIdentitySchema.safeParse({
    candidate_name: candidateName,
    passport,
  });

  useEffect(() => {
    const login = signedIn ? (status?.login ?? null) : null;
    if (identityAccountRef.current !== login) {
      identityAccountRef.current = login;
      setCandidateName(status?.userName ?? "");
      setPassport(status?.userPassport ?? "");
      setAgency("");
      setAccepted(false);
      return;
    }
    // Only fill empty fields on a same-account refresh; never overwrite a correction.
    setCandidateName((current) => current || status?.userName || "");
    setPassport((current) => current || status?.userPassport || "");
  }, [signedIn, status?.login, status?.userName, status?.userPassport]);

  const invalidateSvpData = useCallback(() => {
    setForceTargeted(false);
    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return (
          typeof key === "string" &&
          key.startsWith("svp-") &&
          key !== "svp-accounts" &&
          key !== "svp-session-status"
        );
      },
    });
    void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["svp-accounts"] });
  }, [queryClient]);

  const requireSignIn = () => {
    invalidateSvpData();
  };

  const occupationsQuery = useQuery({
    queryKey: ["svp-occupations"],
    queryFn: () => listSvpBookingOccupations(),
    enabled: signedIn,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const occupations = useMemo(
    () => (occupationsQuery.data?.ok ? occupationsQuery.data.data : []),
    [occupationsQuery.data],
  );
  const occupation = useMemo(
    () => selectedOccupation ?? occupations.find((entry) => entry.id === occupationId) ?? null,
    [occupationId, occupations, selectedOccupation],
  );
  const filteredOccupations = useMemo(() => {
    const needle = occupationSearch.trim().toLowerCase();
    const filtered = needle
      ? occupations.filter((entry) =>
          [entry.name, entry.arabicName, entry.occupationKey, entry.categoryName].some((value) =>
            value?.toLowerCase().includes(needle),
          ),
        )
      : occupations;
    return filtered.slice(0, 250);
  }, [occupationSearch, occupations]);

  const debouncedOccupationSearch = useDebouncedValue(occupationSearch.trim(), 300);
  const occupationSearchQuery = useQuery({
    queryKey: ["svp-occupation-search", debouncedOccupationSearch],
    queryFn: () => searchSvpOccupations({ data: { query: debouncedOccupationSearch } }),
    enabled: signedIn && debouncedOccupationSearch.length >= 1,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const searchResults = useMemo(
    () => (occupationSearchQuery.data?.ok ? occupationSearchQuery.data.data : []),
    [occupationSearchQuery.data],
  );
  const suggestions = useMemo(() => {
    if (debouncedOccupationSearch.length < 1) return filteredOccupations.slice(0, 12);
    const merged = new Map<number, SvpOccupation>();
    for (const entry of [...searchResults, ...filteredOccupations]) {
      if (!merged.has(entry.id)) merged.set(entry.id, entry);
    }
    return [...merged.values()].slice(0, 40);
  }, [debouncedOccupationSearch, filteredOccupations, searchResults]);
  const occupationSearchPending =
    occupationSearch.trim() !== debouncedOccupationSearch || occupationSearchQuery.isFetching;
  const selectableOccupations = useMemo(() => {
    const merged = new Map<number, SvpOccupation>();
    for (const entry of [...occupations, ...suggestions]) {
      if (!merged.has(entry.id)) merged.set(entry.id, entry);
    }
    return [...merged.values()].slice(0, 300);
  }, [occupations, suggestions]);

  const setupQuery = useQuery({
    queryKey: ["svp-setup", occupationId],
    queryFn: () => getSvpBookingSetup({ data: { occupationId } }),
    enabled: signedIn && occupationId !== null,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const setup = setupQuery.data?.ok ? setupQuery.data.data : null;

  const overviewQuery = useQuery({
    queryKey: ["svp-account-overview", occupationId],
    queryFn: () => getSvpAccountOverview({ data: { occupationId } }),
    enabled: signedIn,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const overview = overviewQuery.data?.ok ? overviewQuery.data.data : null;
  // Session country flags come straight from the OTP user and are the most reliable source.
  const isTargeted =
    (forceTargeted || status?.countryTargeted) ??
    overview?.permissions.targeted ??
    setup?.permissions.targeted ??
    true;
  const isLoadBalancer =
    status?.countryLoadBalancer ??
    overview?.permissions.loadBalancer ??
    setup?.permissions.loadBalancer ??
    false;
  const categoryOptions = useMemo(() => overview?.categories ?? [], [overview]);
  const matchedCategory = useMemo(() => {
    if (!occupation) return null;
    const categoryId = occupation.categoryId ?? manualCategoryId;
    const byId = categoryId ? categoryOptions.find((entry) => entry.id === categoryId) : null;
    if (byId) return byId;
    const needle = (occupation.categoryName ?? occupation.name).trim().toLowerCase();
    if (!needle) return null;
    return (
      categoryOptions.find((entry) => {
        const name = entry.name.toLowerCase();
        return (
          name === needle ||
          entry.arabicName?.toLowerCase() === needle ||
          name.includes(needle) ||
          needle.includes(name)
        );
      }) ?? null
    );
  }, [categoryOptions, manualCategoryId, occupation]);
  const languageOptions = useMemo(() => {
    const all = occupation?.languages ?? [];
    const categoryLanguages = matchedCategory?.languages ?? [];
    const filtered = all.filter((entry) => entry.nonTargeted === !isTargeted);
    const categoryFiltered = categoryLanguages.filter((entry) => entry.nonTargeted === !isTargeted);
    const source =
      filtered.length > 0
        ? filtered
        : categoryFiltered.length > 0
          ? categoryFiltered
          : all.length > 0
            ? all
            : categoryLanguages;
    const byLabel = new Map<string, (typeof all)[number]>();
    for (const entry of source) {
      const key = entry.label.toLowerCase();
      const existing = byLabel.get(key);
      if (!existing || (entry.questionCount ?? 0) > (existing.questionCount ?? 0)) {
        byLabel.set(key, entry);
      }
    }
    return [...byLabel.values()];
  }, [isTargeted, matchedCategory, occupation]);
  const activeLanguageCode =
    languageCode && languageOptions.some((entry) => entry.code === languageCode)
      ? languageCode
      : (languageOptions[0]?.code ?? "");

  const citiesQuery = useQuery({
    queryKey: ["svp-cities"],
    queryFn: () => listSvpTestCenterCities(),
    enabled: signedIn && overview !== null && !isTargeted && occupationId !== null,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const cities = useMemo(
    () => (citiesQuery.data?.ok ? citiesQuery.data.data : []),
    [citiesQuery.data],
  );

  // Any SVP call can invalidate the stored session (refresh cookie expired/revoked).
  useEffect(() => {
    const results = [occupationsQuery.data, citiesQuery.data, setupQuery.data, overviewQuery.data];
    if (results.some((result) => result && !result.ok && result.needsSignIn)) {
      invalidateSvpData();
    }
  }, [
    citiesQuery.data,
    invalidateSvpData,
    occupationsQuery.data,
    overviewQuery.data,
    setupQuery.data,
  ]);

  useEffect(() => {
    if (!occupationOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (!occupationBoxRef.current?.contains(event.target as Node)) setOccupationOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [occupationOpen]);

  const effectiveCategoryId =
    occupation?.categoryId ?? manualCategoryId ?? matchedCategory?.id ?? null;
  const categoryId = effectiveCategoryId;
  const datesQuery = useQuery({
    queryKey: ["svp-dates", categoryId, cityCountryId ?? setup?.permissions.countryId ?? null],
    queryFn: () =>
      listSvpAvailableDates({
        data: {
          categoryId: categoryId as number,
          countryId: cityCountryId ?? setup?.permissions.countryId ?? null,
        },
      }),
    enabled: signedIn && checked && categoryId !== null,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const availableDates = useMemo(
    () => (datesQuery.data?.ok ? datesQuery.data.data : []),
    [datesQuery.data],
  );
  const cityOptions = useMemo(() => {
    // Targeted cities come from availability, never the site-only city endpoint.
    // Use those same SVP city labels as a discovery fallback if the site catalogue is empty.
    const source =
      !isTargeted && cities.length > 0
        ? cities
        : availableDates.map((entry) => ({ city: entry.city ?? "", countryId: null }));
    const unique = new Map<string, { city: string; countryId: number | null }>();
    for (const entry of source) {
      const label = entry.city.trim();
      if (label && !unique.has(label.toLowerCase())) {
        unique.set(label.toLowerCase(), { city: label, countryId: entry.countryId });
      }
    }
    return [...unique.values()].sort((a, b) => a.city.localeCompare(b.city));
  }, [availableDates, cities, isTargeted]);
  const chooseCity = useCallback(
    (value: string) => {
      setCity(value);
      setCityCountryId(cityOptions.find((entry) => entry.city === value)?.countryId ?? null);
      setSelectedDate(null);
      setPrometricDate(null);
      setSelectedSession(null);
      setSelectedSlot(null);
      setHoldId(null);
      setPrometricHoldExpiresAt(null);
      setTargetedHoldExpiresAt(null);
    },
    [cityOptions],
  );
  const citiesLoading = isTargeted
    ? datesQuery.isFetching
    : citiesQuery.isFetching || (cities.length === 0 && datesQuery.isFetching);
  useEffect(() => {
    if (!signedIn || !checked || citiesLoading || stage !== "dates" || cityOptions.length === 0)
      return;
    if (city && cityOptions.some((entry) => entry.city === city)) return;
    const nextCity = cityOptions.length === 1 ? cityOptions[0].city : "";
    if (nextCity !== city) chooseCity(nextCity);
  }, [checked, chooseCity, citiesLoading, city, cityOptions, signedIn, stage]);
  const citiesLoaded = isTargeted
    ? Boolean(datesQuery.data?.ok)
    : Boolean(citiesQuery.data?.ok || datesQuery.data?.ok);
  const cityError = isTargeted
    ? datesQuery.isError || (datesQuery.data && !datesQuery.data.ok)
      ? "SVP city availability could not be loaded."
      : null
    : citiesQuery.isError || (citiesQuery.data && !citiesQuery.data.ok)
      ? "The SVP city catalogue is unavailable."
      : null;
  const manualCityFallback =
    !citiesLoading && cityOptions.length === 0 && Boolean(citiesLoaded || cityError);
  const dateOptions = useMemo(() => {
    if (!city.trim()) return [];
    const map = new Map<string, { date: string; city: string | null }>();
    for (const entry of availableDates) {
      if (entry.city && entry.city.trim().toLowerCase() !== city.trim().toLowerCase()) continue;
      const { date } = splitDateTime(entry.startAt);
      if (!date || map.has(date)) continue;
      map.set(date, { date, city: entry.city });
    }
    return [...map.values()];
  }, [availableDates, city]);

  const sessionCity = selectedDate?.city ?? city;
  const sessionDate = selectedDate ? splitDateTime(selectedDate.startAt).date : "";
  const sessionsQuery = useQuery({
    queryKey: ["svp-sessions", categoryId, sessionCity, sessionDate],
    queryFn: () =>
      listSvpExamSessions({
        data: { categoryId: categoryId as number, city: sessionCity, examDate: sessionDate },
      }),
    enabled:
      signedIn && checked && categoryId !== null && Boolean(sessionCity) && Boolean(sessionDate),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const examSessions = sessionsQuery.data?.ok ? sessionsQuery.data.data : [];

  const prometricCode = activeLanguageCode;
  const sitesQuery = useQuery({
    queryKey: ["svp-sites", prometricCode, city, cityCountryId],
    queryFn: () =>
      listSvpPrometricSites({
        data: {
          prometricCode,
          city,
          countryId: cityCountryId ?? setup?.permissions.countryId ?? null,
        },
      }),
    enabled: signedIn && checked && !isTargeted && Boolean(city) && Boolean(prometricCode),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const prometricSites = useMemo(
    () => (sitesQuery.data?.ok ? sitesQuery.data.data.sites : []),
    [sitesQuery.data],
  );
  const prometricExamId = sitesQuery.data?.ok ? sitesQuery.data.data.examId : null;
  const siteDateOptions = useMemo(() => {
    const map = new Map<string, { date: string; city: string | null }>();
    for (const site of prometricSites) {
      for (const date of site.dates) {
        if (date && !map.has(date)) map.set(date, { date, city: site.city });
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [prometricSites]);
  const siteIdsForDate = prometricSites
    .filter((site) => prometricDate && site.dates.includes(prometricDate))
    .map((site) => site.siteId);
  const slotsQuery = useQuery({
    queryKey: ["svp-slots", prometricExamId, prometricDate, siteIdsForDate.join(",")],
    queryFn: () =>
      listSvpPrometricSlots({
        data: {
          examId: prometricExamId as string,
          siteIds: siteIdsForDate,
          date: prometricDate as string,
        },
      }),
    enabled:
      signedIn &&
      checked &&
      !isTargeted &&
      Boolean(prometricExamId) &&
      Boolean(prometricDate) &&
      siteIdsForDate.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const prometricSlots = slotsQuery.data?.ok ? slotsQuery.data.data : [];

  const availabilityCity = selectedDate?.city ?? city;
  const availabilityDate = isTargeted
    ? selectedDate
      ? splitDateTime(selectedDate.startAt).date
      : ""
    : (prometricDate ?? "");
  const takamolQuery = useQuery({
    queryKey: ["svp-takamol-availability", effectiveCategoryId, availabilityCity, availabilityDate],
    queryFn: () =>
      lookupTakamolAvailability({
        data: {
          endpoint: "sessions",
          categoryId: String(effectiveCategoryId),
          city: availabilityCity,
          examDate: availabilityDate,
        },
      }),
    enabled:
      checked &&
      Boolean(effectiveCategoryId) &&
      Boolean(availabilityCity) &&
      /^\d{4}-\d{2}-\d{2}$/.test(availabilityDate),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const takamolRows = takamolQuery.data?.success
    ? parseSessionTableRows(takamolQuery.data.data, availabilityCity)
    : [];
  const activeLanguageLabel =
    languageOptions.find((entry) => entry.code === activeLanguageCode)?.label ?? activeLanguageCode;

  // If the site-based attempt fails after eligibility but targeted dates exist, use them.
  useEffect(() => {
    if (isTargeted || !checked) return;
    const sitesFailed = sitesQuery.data && !sitesQuery.data.ok;
    const sitesEmpty = sitesQuery.data?.ok && prometricSites.length === 0;
    if ((sitesFailed || sitesEmpty) && availableDates.length > 0) setForceTargeted(true);
  }, [availableDates.length, checked, isTargeted, prometricSites.length, sitesQuery.data]);

  const reservationsQuery = useQuery({
    queryKey: ["svp-reservations"],
    queryFn: () => listSvpReservations(),
    enabled: signedIn,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const reservations: SvpReservation[] = reservationsQuery.data?.ok
    ? reservationsQuery.data.data
    : [];
  const cancelledReservations = reservations.filter((entry) =>
    /cancel/i.test(entry.status ?? ""),
  ).length;

  const selectOccupation = async (entry: SvpOccupation) => {
    const token = ++selectionTokenRef.current;

    // Apply the selection immediately so the UI never stays on the old value.
    setManualCategoryId(null);
    setSelectedOccupation(entry);
    setOccupationId(entry.id);
    setLanguageCode("");
    setOccupationSearch(entry.name);
    setOccupationOpen(false);
    setChecked(false);
    setEligibility(null);
    setSelectedDate(null);
    setSelectedSession(null);
    setPrometricDate(null);
    setSelectedSlot(null);
    setHoldId(null);
    setPrometricHoldExpiresAt(null);
    setTargetedHoldExpiresAt(null);
    setCity("");
    setCityCountryId(null);
    setStage("select");

    if (entry.categoryId) return;
    setOccupationLookup(true);
    try {
      const detail = await getSvpOccupationById({ data: { occupationId: entry.id } });
      if (detail.ok && selectionTokenRef.current === token) {
        setSelectedOccupation(detail.data);
      }
    } catch {
      // Keep the selected entry; the category auto-match/manual selector handles it.
    } finally {
      if (selectionTokenRef.current === token) setOccupationLookup(false);
    }
  };

  const chooseSlot = (slot: SvpPrometricSlot) => {
    const site = prometricSites.find((entry) => entry.siteId === slot.siteId) ?? null;
    setSelectedSlot(slot);
    setSelectedSession({
      id: slot.id,
      startAt: slot.startAt,
      endAt: null,
      duration: slot.duration,
      availableSeats: null,
      city: site?.city ?? city,
      centerName: site?.name ?? null,
      siteId: slot.siteId,
    });
    setHoldId(null);
    setTargetedHoldExpiresAt(null);
    setPrometricHoldExpiresAt(null);
  };

  const holdMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot?.siteId) throw new Error("Select a slot first.");
      const response = await createSvpPrometricHold({
        data: { slotId: selectedSlot.id, siteId: selectedSlot.siteId },
      });
      if (!response.ok) {
        if (response.needsSignIn) requireSignIn();
        throw new Error(response.message);
      }
      return response.data;
    },
    onSuccess: (data) => {
      setHoldId(data.holdId);
      setPrometricHoldExpiresAt(data.expiresAt);
      setStage("confirm");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "SVP could not hold the slot."),
  });

  const targetedHoldMutation = useMutation({
    mutationFn: async (): Promise<{
      expiresAt: string | null;
      session: SvpExamSession | null;
    }> => {
      if (!effectiveCategoryId) throw new Error("Choose the SVP category first.");
      const ids = isLoadBalancer
        ? examSessions.map((entry) => entry.id)
        : selectedSession
          ? [selectedSession.id]
          : [];
      if (ids.length === 0) throw new Error("Select an exam session first.");

      const response = await createSvpTargetedHold({
        data: {
          examSessionId: isLoadBalancer ? ids : (ids[0] as string | number),
          categoryId: effectiveCategoryId,
          countryId: cityCountryId ?? setup?.permissions.countryId ?? null,
        },
      });
      if (!response.ok) {
        if (response.needsSignIn) requireSignIn();
        throw new Error(response.message);
      }

      let assigned = selectedSession ?? examSessions[0] ?? null;
      if (response.data.examSessionId !== null && response.data.examSessionId !== undefined) {
        const detail = await getSvpExamSessionById({
          data: { examSessionId: String(response.data.examSessionId) },
        });
        if (detail.ok) assigned = detail.data;
      }
      return { expiresAt: response.data.expiresAt, session: assigned };
    },
    onSuccess: (data) => {
      if (data.session) setSelectedSession(data.session);
      setTargetedHoldExpiresAt(data.expiresAt);
      setStage("confirm");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "SVP could not hold this seat."),
  });

  const continueFromDates = () => {
    if (isTargeted) {
      targetedHoldMutation.mutate();
      return;
    }
    holdMutation.mutate();
  };

  const selectDateOption = (entry: { date: string; city: string | null }) => {
    setSelectedSession(null);
    setSelectedSlot(null);
    setHoldId(null);
    setPrometricHoldExpiresAt(null);
    setTargetedHoldExpiresAt(null);
    if (isTargeted) {
      const nextDate =
        availableDates.find(
          (candidate) =>
            splitDateTime(candidate.startAt).date === entry.date &&
            (!candidate.city || candidate.city.trim().toLowerCase() === city.trim().toLowerCase()),
        ) ?? null;
      setSelectedDate(nextDate);
      return;
    }
    setPrometricDate(entry.date);
  };

  const retryOccupations = () => {
    void occupationsQuery.refetch();
    if (debouncedOccupationSearch) void occupationSearchQuery.refetch();
    void citiesQuery.refetch();
  };

  const refreshAvailability = () => {
    if (availabilityCity && availabilityDate) void takamolQuery.refetch();
    if (!isTargeted) void citiesQuery.refetch();
    if (isTargeted) {
      void datesQuery.refetch();
      if (activeDateValue) void sessionsQuery.refetch();
      return;
    }
    if (city && prometricCode) void sitesQuery.refetch();
    if (cities.length === 0) void datesQuery.refetch();
    if (prometricDate) void slotsQuery.refetch();
  };

  const diagnosticsMutation = useMutation({
    mutationFn: async () => {
      const response = await getSvpDiagnostics();
      if (!response.ok) throw new Error(response.message);
      return response.data;
    },
    onSuccess: (data) => setDiagnostics(data),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Diagnostics could not run."),
  });

  const startNewBooking = () => {
    resetFlow();
    setAddAccountOpen(false);
    setRescheduleId(null);
    setStage("select");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetFlow = () => {
    setManualCategoryId(null);
    setStage("select");
    setOccupationId(null);
    setSelectedOccupation(null);
    setLanguageCode("");
    setCity("");
    setCityCountryId(null);
    setOccupationSearch("");
    setOccupationOpen(false);
    setEligibility(null);
    setChecked(false);
    setSelectedDate(null);
    setSelectedSession(null);
    setPrometricDate(null);
    setSelectedSlot(null);
    setHoldId(null);
    setPrometricHoldExpiresAt(null);
    setTargetedHoldExpiresAt(null);
    setCandidateName(status?.userName ?? "");
    setPassport(status?.userPassport ?? "");
    setAgency("");
    setAccepted(false);
    setResult(null);
    setLocalSaveStatus("idle");
    localRecordRef.current = null;
    bookingSubmittedRef.current = false;
  };

  const downloadTicketById = async (
    reservationId: string,
    name: string | null,
    occupationEnglishName: string | null,
  ) => {
    if (downloadingId) return;
    setDownloadingId(reservationId);
    try {
      const response = await downloadSvpTicket({ data: { reservationId } });
      if (!response.ok) {
        if (response.needsSignIn) requireSignIn();
        toast.error(response.message);
        return;
      }
      const fileName = svpTicketFileName(name, occupationEnglishName);
      savePdfBase64(response.data.base64, response.data.contentType, fileName);
      toast.success(`Ticket saved as ${fileName}`);
    } catch {
      toast.error("The SVP ticket could not be downloaded.");
    } finally {
      setDownloadingId(null);
    }
  };

  const syncLocalReschedule = async (
    reservationId: string,
    updated: { startAt: string; city: string | null; centerName: string | null },
  ) => {
    const { date, time } = splitDateTime(updated.startAt);
    const { error } = await supabase
      .from("svp_bookings")
      .update({
        exam_date: date || null,
        exam_time: time || null,
        center: updated.centerName ?? updated.city ?? null,
      })
      .eq("reference_no", reservationId);
    if (!error) toast.success("Local record updated with the new appointment");
  };

  const saveLocalRecord = async (payload: SvpLocalRecordPayload) => {
    if (localSaveBusyRef.current) return;
    localSaveBusyRef.current = true;
    setLocalSaveStatus("saving");
    try {
      await saveSvpLocalBookingRecord(supabase, payload);
      setLocalSaveStatus("saved");
      void queryClient.invalidateQueries({ queryKey: ["svp-bookings"] });
      toast.success("SVP reservation saved automatically to the local records.");
    } catch {
      setLocalSaveStatus("failed");
      toast.error("Booked in SVP, but the local record could not be saved.");
    } finally {
      localSaveBusyRef.current = false;
    }
  };

  const eligibilityMutation = useMutation({
    mutationFn: () =>
      checkSvpBookingEligibility({
        data: { categoryId: categoryId as number, countryId: setup?.permissions.countryId ?? null },
      }),
    onSuccess: (response) => {
      if (!response.ok) {
        if (response.needsSignIn) requireSignIn();
        toast.error(response.message);
        return;
      }
      setEligibility(response.data);
      const failed = response.data.find((entry) => !entry.passed);
      if (failed) {
        toast.error(failed.message);
        return;
      }
      setChecked(true);
      setStage("dates");
    },
    onError: () => toast.error("Eligibility checks could not be completed."),
  });

  const eligibilityKey =
    occupation && effectiveCategoryId && activeLanguageCode
      ? `${occupation.id}:${effectiveCategoryId}:${city}:${activeLanguageCode}`
      : "";
  const runEligibility = eligibilityMutation.mutate;

  useEffect(() => {
    if (!eligibilityKey || checked || eligibilityMutation.isPending) return;
    if (eligibility?.some((entry) => !entry.passed)) return;
    const timer = window.setTimeout(() => {
      if (autoCheckRef.current === eligibilityKey) return;
      autoCheckRef.current = eligibilityKey;
      runEligibility();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    checked,
    city,
    effectiveCategoryId,
    eligibility,
    eligibilityKey,
    eligibilityMutation.isPending,
    isTargeted,
    runEligibility,
  ]);

  const bookingMutation = useMutation({
    mutationFn: async (): Promise<{
      booking: SvpBookingResult;
      localRecord: SvpLocalRecordPayload;
    }> => {
      if (bookingSubmittedRef.current)
        throw new Error("This reservation is already being submitted.");
      if (!occupation || !selectedSession) throw new Error("Select an exam session first.");
      if (!activeLanguageCode)
        throw new Error("SVP has not provided a valid exam language for this occupation.");
      if (!accepted) throw new Error("Confirm the candidate details and SVP rules first.");
      if (occupation.driverLicenseRequired)
        throw new Error("Use the official SVP portal for this occupation.");
      const { date, time } = splitDateTime(selectedSession.startAt);
      // Validate and snapshot the local identity before an irreversible upstream submission.
      const localRecord = toSvpBookingInsert(
        normalizeSvpBookingForm({
          candidate_name: candidateName,
          passport,
          occupation: occupation.name,
          center: selectedSession.centerName ?? selectedSession.city ?? sessionCity,
          exam_date: date,
          exam_time: time,
          agency,
          login_email: status?.login?.includes("@") ? status.login : "",
          reference_no: "",
          notes: "",
          status: date && time ? "booked" : "draft",
        }),
      );
      bookingSubmittedRef.current = true;
      const response = await createSvpBooking({
        data: {
          occupationId: occupation.id,
          categoryId: effectiveCategoryId as number,
          examSessionId: isTargeted ? selectedSession.id : (prometricExamId ?? selectedSession.id),
          languageCode: activeLanguageCode,
          methodology: "in_person",
          duration: selectedSession.duration > 0 ? selectedSession.duration : null,
          startAt: /\d{2}:\d{2}/.test(selectedSession.startAt) ? selectedSession.startAt : null,
          siteId: selectedSession.siteId,
          // The portal only sends site_city for non-targeted (site-based) sessions.
          siteCity: selectedSession.siteId ? (selectedSession.city ?? sessionCity) : null,
          holdId: isTargeted ? null : holdId,
          countryId: cityCountryId ?? setup?.permissions.countryId ?? null,
        },
      });
      if (!response.ok) {
        if (response.needsSignIn) requireSignIn();
        throw new Error(response.message);
      }
      const booking = response.data;
      return {
        booking,
        localRecord: {
          ...localRecord,
          reference_no: booking.reservationId,
          notes: `SVP ${booking.reservationId}: ${booking.message}`.slice(0, 1000),
          // Pending payment is not a confirmed local booking.
          status: booking.paymentRequired ? "draft" : localRecord.status,
        },
      };
    },
    onSuccess: async ({ booking, localRecord }) => {
      setResult(booking);
      setStage("done");
      localRecordRef.current = localRecord;
      await saveLocalRecord(localRecord);
      void queryClient.invalidateQueries({ queryKey: ["svp-reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["svp-account-overview"] });
    },
    onError: (error) => {
      bookingSubmittedRef.current = false;
      toast.error(error instanceof Error ? error.message : "The SVP reservation failed.");
    },
  });

  const signOutMutation = useMutation({
    mutationFn: (all: boolean) => signOutSvpSession({ data: all ? { all: true } : {} }),
    onSuccess: (_data, all) => {
      resetFlow();
      setAddAccountOpen(false);
      invalidateSvpData();
      toast.success(all ? "All SVP accounts removed" : "Active SVP account removed");
    },
    onError: () => toast.error("Could not sign out of SVP."),
  });

  const switchMutation = useMutation({
    mutationFn: (login: string) => switchSvpAccount({ data: { login } }),
    onSuccess: () => {
      resetFlow();
      setAddAccountOpen(false);
      invalidateSvpData();
      toast.success("SVP account switched");
    },
    onError: () => toast.error("Could not switch the SVP account."),
  });

  const removeMutation = useMutation({
    mutationFn: (login: string) => removeSvpAccount({ data: { login } }),
    onSuccess: () => {
      resetFlow();
      setAddAccountOpen(false);
      invalidateSvpData();
      toast.success("SVP account removed");
    },
    onError: () => toast.error("Could not remove the SVP account."),
  });

  const handleSignedIn = () => {
    setAddAccountOpen(false);
    resetFlow();
    invalidateSvpData();
  };

  const shownDateOptions = isTargeted ? dateOptions : siteDateOptions;
  const datesLoading = isTargeted ? datesQuery.isFetching : sitesQuery.isFetching;
  const datesError = isTargeted
    ? datesQuery.data && !datesQuery.data.ok
      ? datesQuery.data.message
      : null
    : sitesQuery.data && !sitesQuery.data.ok
      ? sitesQuery.data.message
      : null;
  const datesLoaded = isTargeted ? Boolean(datesQuery.data?.ok) : Boolean(sitesQuery.data?.ok);
  const activeDateValue = isTargeted
    ? selectedDate
      ? splitDateTime(selectedDate.startAt).date
      : ""
    : (prometricDate ?? "");
  const sessionViews: SvpExamSessionView[] = isTargeted
    ? examSessions.map((entry) => ({
        key: `s-${entry.id}`,
        startAt: entry.startAt,
        endAt: entry.endAt,
        center: entry.centerName,
        city: entry.city ?? sessionCity,
        seats: entry.availableSeats,
        duration: entry.duration,
        durationUnit: "seconds",
        selected: selectedSession?.id === entry.id && !selectedSlot,
        onSelect: () => {
          setSelectedSession(entry);
          setSelectedSlot(null);
          setHoldId(null);
          setPrometricHoldExpiresAt(null);
          setTargetedHoldExpiresAt(null);
        },
      }))
    : prometricSlots.map((slot) => {
        const site = prometricSites.find((entry) => entry.siteId === slot.siteId) ?? null;
        return {
          key: `p-${slot.id}`,
          startAt: slot.startAt,
          center: site?.name ?? null,
          city: site?.city ?? city,
          seats: null as number | null,
          duration: slot.duration,
          durationUnit: "minutes",
          selected: selectedSlot?.id === slot.id,
          onSelect: () => chooseSlot(slot),
        };
      });
  const sessionsLoading = isTargeted ? sessionsQuery.isFetching : slotsQuery.isFetching;
  const sessionsError = isTargeted
    ? sessionsQuery.data && !sessionsQuery.data.ok
      ? sessionsQuery.data.message
      : sessionsQuery.isError
        ? "Could not load exam sessions. Please retry."
        : null
    : slotsQuery.data && !slotsQuery.data.ok
      ? slotsQuery.data.message
      : slotsQuery.isError
        ? "Could not load available slots. Please retry."
        : null;
  const sessionsLoaded = isTargeted
    ? Boolean(sessionsQuery.data?.ok)
    : Boolean(slotsQuery.data?.ok);

  if (sessionQuery.isPending) {
    return (
      <section
        className="flex items-center gap-2 rounded-2xl border bg-card p-6 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="h-4 w-4 animate-spin" /> Checking the SVP session…
      </section>
    );
  }

  if (!signedIn) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border bg-card/80 p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            SVP booking workspace
          </p>
          <h1 className="mt-1 text-xl font-bold">New booking</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with the candidate&apos;s SVP account. After the OTP, this page opens the
            booking form automatically.
          </p>
        </div>
        {sessionQuery.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            The SVP session could not be checked. Sign in again.
          </p>
        )}
        <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">
          Sign in to an SVP account. You can keep up to 4 accounts and switch between them without
          entering the password and OTP again.
        </p>
        {(sessionQuery.data?.accountCount ?? 0) > 0 && (
          <p
            role="status"
            className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950"
          >
            Your saved SVP session expired. Sign in again with the username and password to refresh
            it.
          </p>
        )}
        <SvpLoginPanel onSignedIn={handleSignedIn} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {addAccountOpen && (
        <section className="card-surface space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Add another SVP account</h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAddAccountOpen(false)}
            >
              Cancel
            </Button>
          </div>
          <SvpLoginPanel onSignedIn={handleSignedIn} />
        </section>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-emerald-900/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-lg sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-[11px] font-medium text-emerald-100">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Official SVP API · live · v18
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Book an SVP appointment
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Check real availability, hold a seat and create the reservation for the signed-in SVP
              account.
            </p>
          </div>
          <div className="w-full space-y-2 sm:w-auto">
            <div className="grid w-full gap-2 text-xs sm:grid-cols-2">
              {[
                { label: "Account", value: status?.userName ?? status?.login ?? "—" },
                { label: "Country", value: overview?.permissions.countryName ?? "—" },
                {
                  label: "Flow",
                  value: overview ? (isTargeted ? "Targeted" : "Site-based") : "—",
                },
                { label: "Credits", value: overview ? String(overview.credits) : "—" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="min-w-0 rounded-xl border border-white/10 bg-black/10 px-3 py-2"
                >
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                    {item.label}
                  </p>
                  <p className="truncate text-sm font-medium text-slate-100">{item.value}</p>
                </div>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full bg-emerald-400 font-semibold text-slate-950 shadow-sm hover:bg-emerald-300"
              onClick={startNewBooking}
              disabled={
                bookingMutation.isPending ||
                localSaveStatus === "saving" ||
                Boolean(result && localSaveStatus !== "saved")
              }
            >
              <Plus className="mr-1 h-4 w-4" /> New booking
            </Button>
          </div>
        </div>
      </section>

      <section className="card-surface space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">
                Signed in to SVP{status?.userName ? ` as ${status.userName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {status?.login}
                {overview?.permissions.countryName
                  ? ` · ${overview.permissions.countryName}`
                  : setup?.permissions.countryName
                    ? ` · ${setup.permissions.countryName}`
                    : ""}
                {status?.expiresAt
                  ? ` · session valid until ${new Date(status.expiresAt * 1000).toLocaleTimeString(
                      "en-GB",
                      { hour: "2-digit", minute: "2-digit" },
                    )}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={startNewBooking}
              disabled={Boolean(result && localSaveStatus !== "saved")}
            >
              <Plus className="mr-1 h-4 w-4" /> New booking
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void overviewQuery.refetch()}
              disabled={overviewQuery.isFetching}
            >
              <RefreshCw
                className={`mr-1 h-4 w-4 ${overviewQuery.isFetching ? "animate-spin" : ""}`}
              />
              Permissions
            </Button>
            <a href={SVP_PORTAL_BOOKING_URL} target="_blank" rel="noreferrer">
              <Button type="button" variant="outline" size="sm">
                <ExternalLink className="mr-1 h-4 w-4" /> Portal
              </Button>
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => signOutMutation.mutate(false)}
              disabled={signOutMutation.isPending}
            >
              <LogOut className="mr-1 h-4 w-4" /> Remove active
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="min-w-[16rem] flex-1">
            <Field label="Active SVP account">
              <NativeSelect
                value={status?.login ?? ""}
                onChange={(event) => switchMutation.mutate(event.target.value)}
                disabled={switchMutation.isPending || accounts.length < 2}
              >
                {(accounts.length > 0
                  ? accounts
                  : [{ login: status?.login ?? "", userName: status?.userName ?? null }]
                ).map((account) => (
                  <option key={account.login} value={account.login}>
                    {account.userName ? `${account.userName} · ${account.login}` : account.login}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setAddAccountOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add account
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => status?.login && removeMutation.mutate(status.login)}
            disabled={!status?.login || removeMutation.isPending}
          >
            Remove
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => signOutMutation.mutate(true)}
            disabled={signOutMutation.isPending}
          >
            Sign out all
          </Button>
        </div>

        {overview && (
          <div className="space-y-2 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border px-2.5 py-0.5">
                Country: {overview.permissions.countryName ?? "—"}
              </span>
              <span className="rounded-full border px-2.5 py-0.5">
                Flow: {overview.permissions.targeted ? "targeted" : "site-based"}
              </span>
              <span className="rounded-full border px-2.5 py-0.5">
                Free reservations: {overview.permissions.freeReservations ? "yes" : "no"}
              </span>
              <span className="rounded-full border px-2.5 py-0.5">Credits: {overview.credits}</span>
              <span className="rounded-full border px-2.5 py-0.5">
                Reschedules left: {overview.constraints.rescheduleTimes}
              </span>
              <span className="rounded-full border px-2.5 py-0.5">
                Hold: {overview.constraints.bookingHoldSeconds}s
              </span>
              <span className="rounded-full border px-2.5 py-0.5">
                Reschedule flow: {overview.flags.rescheduleEnabled ? "enabled" : "off"}
              </span>
            </div>
            {overview.permissions.permissionKeys.length > 0 && (
              <p className="truncate" title={overview.permissions.permissionKeys.join(", ")}>
                SVP account permissions: {overview.permissions.permissionKeys.join(", ")}
              </p>
            )}
          </div>
        )}
        {overviewQuery.data && !overviewQuery.data.ok && (
          <p role="alert" className="text-sm text-destructive">
            {overviewQuery.data.message}
          </p>
        )}
      </section>

      <BookingStepper stage={stage} />

      {rescheduleId && (
        <SvpReschedulePanel
          reservationId={rescheduleId}
          rescheduleTimes={overview?.constraints.rescheduleTimes ?? null}
          countryId={overview?.permissions.countryId ?? null}
          isTargeted={isTargeted}
          onCancel={() => setRescheduleId(null)}
          onDone={(updated) => {
            const reservationId = rescheduleId;
            setRescheduleId(null);
            void queryClient.invalidateQueries({ queryKey: ["svp-reservations"] });
            void queryClient.invalidateQueries({ queryKey: ["svp-account-overview"] });
            if (updated && reservationId) void syncLocalReschedule(reservationId, updated);
          }}
        />
      )}

      <div className="space-y-4">
        {!addAccountOpen && !rescheduleId && stage === "select" && (
          <section className="card-surface space-y-4 p-4 sm:p-5">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <BriefcaseBusiness className="h-5 w-5" />
                </span>
                <h2 className="text-xl font-bold">Step 1 · Occupation and test center</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the signed-in candidate&apos;s SVP account. Only occupations linked to an SVP
                category can be booked.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {languageOptions.length > 0 && (
                <Field label="Exam language">
                  {languageOptions.length > 1 ? (
                    <NativeSelect
                      value={activeLanguageCode}
                      onChange={(event) => {
                        setLanguageCode(event.target.value);
                        setSelectedDate(null);
                        setSelectedSession(null);
                        setSelectedSlot(null);
                        setHoldId(null);
                        setPrometricHoldExpiresAt(null);
                        setTargetedHoldExpiresAt(null);
                        setChecked(false);
                        setEligibility(null);
                        setStage("select");
                      }}
                    >
                      {languageOptions.map((entry) => (
                        <option key={entry.code} value={entry.code}>
                          {entry.label}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                      <p className="font-medium">{languageOptions[0]?.label}</p>
                      <p className="break-all text-xs text-muted-foreground">
                        Auto-selected from SVP · {activeLanguageCode}
                      </p>
                    </div>
                  )}
                </Field>
              )}
              {occupation && languageOptions.length === 0 && (
                <p
                  role={overviewQuery.isFetching ? "status" : "alert"}
                  className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950"
                >
                  {overviewQuery.isFetching
                    ? "Loading supported exam languages from SVP…"
                    : "SVP did not return an exam language code for this occupation. Booking is disabled until a supported language is available."}
                </p>
              )}
              <div className="space-y-2">
                <Field label="Occupation *">
                  <div className="relative" ref={occupationBoxRef}>
                    <Input
                      value={occupationSearch}
                      onChange={(event) => {
                        setOccupationSearch(event.target.value);
                        setOccupationOpen(true);
                      }}
                      onFocus={() => setOccupationOpen(true)}
                      placeholder="Type a name, e.g. welder or loading"
                      autoComplete="off"
                      aria-autocomplete="list"
                      required
                    />
                    {occupationOpen && (
                      <div
                        className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg"
                        aria-label="Similar occupations"
                      >
                        {occupationSearchPending && (
                          <p
                            className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"
                            role="status"
                          >
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Searching similar
                            occupations…
                          </p>
                        )}
                        {occupationSearchQuery.data && !occupationSearchQuery.data.ok && (
                          <p role="alert" className="px-2 py-1.5 text-xs text-destructive">
                            {occupationSearchQuery.data.message}
                          </p>
                        )}
                        {!occupationSearchPending &&
                          debouncedOccupationSearch.length >= 1 &&
                          suggestions.length === 0 &&
                          occupationSearchQuery.data?.ok && (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                              No similar occupation found for “{debouncedOccupationSearch}”.
                            </p>
                          )}
                        {suggestions.length > 0 && (
                          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {suggestions.length} similar occupation
                            {suggestions.length === 1 ? "" : "s"}
                          </p>
                        )}
                        {suggestions.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => void selectOccupation(entry)}
                            className="flex w-full items-start justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{entry.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {entry.occupationKey ? `${entry.occupationKey} · ` : ""}
                                {entry.categoryName ?? "No SVP category"}
                              </span>
                            </span>
                            {occupationId === entry.id && (
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>
                {occupation && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">Selected: {occupation.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {occupation.occupationKey ?? occupation.id} · category{" "}
                        {effectiveCategoryId ?? "not linked"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedOccupation(null);
                        setOccupationId(null);
                        setOccupationSearch("");
                        setOccupationOpen(true);
                      }}
                    >
                      Change
                    </Button>
                  </div>
                )}
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">Or pick from the loaded list</p>
                  <NativeSelect
                    aria-label="Choose occupation from list"
                    value={occupationId ?? ""}
                    onChange={(event) => {
                      const id = Number(event.target.value);
                      const next = selectableOccupations.find((entry) => entry.id === id);
                      if (next) void selectOccupation(next);
                    }}
                  >
                    <option value="">Select an occupation</option>
                    {selectableOccupations.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                        {entry.occupationKey ? ` · ${entry.occupationKey}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </div>

            {occupationsQuery.isPending && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading occupations from SVP…
              </p>
            )}
            {occupationsQuery.isError && (
              <div
                className="flex flex-wrap items-center gap-2 text-sm text-destructive"
                role="alert"
              >
                <span>
                  Occupations could not be loaded:{" "}
                  {occupationsQuery.error instanceof Error
                    ? occupationsQuery.error.message
                    : "unknown error"}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={retryOccupations}>
                  Retry
                </Button>
              </div>
            )}
            {occupationsQuery.data && !occupationsQuery.data.ok && (
              <div
                className="flex flex-wrap items-center gap-2 text-sm text-destructive"
                role="alert"
              >
                <span>{occupationsQuery.data.message}</span>
                <Button type="button" size="sm" variant="outline" onClick={retryOccupations}>
                  Retry
                </Button>
              </div>
            )}
            {occupationsQuery.data?.ok && occupations.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {occupations.length} occupations loaded from SVP.
              </p>
            )}
            {occupationsQuery.data?.ok &&
              occupations.length === 0 &&
              !occupation &&
              !occupationSearch.trim() && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm" role="status">
                  <p className="font-medium">SVP returned no occupations for this account.</p>
                  <p className="text-xs text-muted-foreground">
                    Account: {status?.login ?? "—"} · Flow: {isTargeted ? "targeted" : "site-based"}{" "}
                    · Country: {overview?.permissions.countryName ?? "—"} · Build: v18
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Type a word such as <strong>welder</strong> or <strong>loading</strong> in the
                    Occupation field to search SVP directly.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={retryOccupations}>
                      Reload occupations
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => diagnosticsMutation.mutate()}
                      disabled={diagnosticsMutation.isPending}
                    >
                      {diagnosticsMutation.isPending ? "Checking…" : "Run diagnostics"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => signOutMutation.mutate(false)}
                      disabled={signOutMutation.isPending}
                    >
                      Sign out SVP & retry
                    </Button>
                  </div>
                  {diagnostics && (
                    <div className="grid gap-1 rounded-lg border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
                      <p>
                        session: {diagnostics.login ?? "—"} · svp id: {diagnostics.svpUserId ?? "—"}{" "}
                        · stored targeted: {String(diagnostics.countryTargeted)}
                      </p>
                      <p>
                        permissions: HTTP {diagnostics.permissions.status} · targeted:{" "}
                        {String(diagnostics.permissions.targeted)} · country:{" "}
                        {diagnostics.permissions.country ?? "—"}
                      </p>
                      <p>
                        labor occupations: HTTP {diagnostics.labor.status} ·{" "}
                        {diagnostics.labor.count} items · {diagnostics.labor.message ?? "ok"}
                      </p>
                      <p>
                        visitor occupations: HTTP {diagnostics.visitor.status} ·{" "}
                        {diagnostics.visitor.count} items · {diagnostics.visitor.message ?? "ok"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            {citiesQuery.data && !citiesQuery.data.ok && !isTargeted && (
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-2 text-xs text-amber-950"
                role="status"
              >
                <span>
                  City catalogue unavailable — Step 2 uses SVP availability cities or an explicit
                  manual fallback. ({citiesQuery.data.message})
                </span>
                <Button type="button" size="sm" variant="outline" onClick={retryOccupations}>
                  Retry
                </Button>
              </div>
            )}
            {occupationLookup && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading the full occupation…
              </p>
            )}
            {occupation &&
              !occupation.categoryId &&
              !occupationLookup &&
              (categoryOptions.length > 0 ? (
                <Field label="SVP category *">
                  <NativeSelect
                    value={manualCategoryId ?? matchedCategory?.id ?? ""}
                    onChange={(event) => setManualCategoryId(Number(event.target.value) || null)}
                  >
                    <option value="">Select the SVP category</option>
                    {categoryOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {matchedCategory
                      ? `Auto-matched to “${matchedCategory.name}” from the SVP category catalogue. Change it if needed.`
                      : "This occupation has no category in SVP. Choose the matching category to continue."}
                  </p>
                </Field>
              ) : (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-2 text-sm text-amber-950"
                  role="alert"
                >
                  <span>No SVP category list is available. Sign out SVP and retry.</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => signOutMutation.mutate(false)}
                  >
                    Sign out SVP
                  </Button>
                </div>
              ))}
            {setupQuery.isPending && occupationId !== null && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading SVP permissions…
              </p>
            )}
            {setupQuery.data && !setupQuery.data.ok && (
              <p role="alert" className="text-sm text-destructive">
                {setupQuery.data.message}
              </p>
            )}
            {setup && (
              <p className="text-xs text-muted-foreground">
                Free reservations: {setup.permissions.freeReservations ? "yes" : "no"} · SVP
                credits: {setup.credits}
              </p>
            )}

            {eligibility && (
              <div className="space-y-2">
                {eligibility.map((check) => (
                  <div
                    key={check.key}
                    className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${
                      check.passed
                        ? "border-border bg-muted/30"
                        : "border-destructive/30 bg-destructive/5 text-destructive"
                    }`}
                  >
                    {check.passed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>
                      <strong>{check.label}:</strong> {check.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => eligibilityMutation.mutate()}
                disabled={
                  !occupation ||
                  !effectiveCategoryId ||
                  !activeLanguageCode ||
                  occupationLookup ||
                  eligibilityMutation.isPending
                }
              >
                {eligibilityMutation.isPending ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Check eligibility
              </Button>
              {checked && (
                <Button type="button" variant="outline" onClick={() => setStage("dates")}>
                  <CalendarDays className="mr-2 h-4 w-4" /> Continue
                </Button>
              )}
            </div>
          </section>
        )}

        {!addAccountOpen && !rescheduleId && stage === "dates" && (
          <section className="card-surface space-y-4 p-4 sm:p-5">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <h2 className="text-xl font-bold">Step 2 · Choose the exam session</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {occupation?.name} · {city}
                {activeDateValue ? ` · ${formatDateOnly(activeDateValue)}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Dates and sessions come live from SVP; refresh if availability changes.
              </p>
              <Button type="button" size="sm" variant="ghost" onClick={refreshAvailability}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh availability
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
              <Field label={isTargeted ? "Test center city" : "Test center city *"}>
                <NativeSelect
                  value={cityOptions.some((entry) => entry.city === city) ? city : ""}
                  onChange={(event) => chooseCity(event.target.value)}
                  disabled={cityOptions.length === 0}
                  aria-busy={citiesLoading}
                  required
                >
                  <option value="">
                    {citiesLoading && cityOptions.length === 0
                      ? "Loading cities from SVP…"
                      : cityOptions.length === 0
                        ? "No cities returned by SVP"
                        : "Select a city"}
                  </option>
                  {cityOptions.map((entry) => (
                    <option key={entry.city} value={entry.city}>
                      {entry.city}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {citiesLoading ? (
                <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading cities from SVP…
                </p>
              ) : cityOptions.length > 0 ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {cityOptions.length === 1
                    ? "The only available city is selected automatically."
                    : "Choose a city to see its available dates and sessions."}
                  {isTargeted || cities.length === 0
                    ? " Cities loaded from SVP availability."
                    : " Cities loaded from the SVP test-center catalogue."}
                </p>
              ) : citiesLoaded ? (
                <p role="status" className="text-xs text-muted-foreground">
                  SVP has not returned any city options for this occupation.
                </p>
              ) : null}
              {cityError && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-2 text-xs text-warning"
                >
                  <span>{cityError}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={refreshAvailability}
                    disabled={citiesLoading}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry cities
                  </Button>
                </div>
              )}
              {manualCityFallback && (
                <Field label="City (manual fallback)">
                  <Input
                    value={city}
                    onChange={(event) => chooseCity(event.target.value)}
                    maxLength={120}
                    placeholder="Enter a known SVP test center city"
                    required
                  />
                  <span className="block text-xs text-muted-foreground">
                    The API has no city list. Enter a city only if you know the SVP test center;
                    availability must still be confirmed by SVP.
                  </span>
                </Field>
              )}
            </div>
            {!city.trim() && cityOptions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Select the test center city to load matching availability.
              </p>
            )}

            {eligibility && eligibility.every((entry) => entry.passed) && (
              <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2 text-xs">
                <CheckCircle2 className="h-4 w-4 text-success" /> All SVP checks passed.
              </p>
            )}

            {datesLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Loading available dates…
              </p>
            )}
            {datesError && (
              <p role="alert" className="text-sm text-destructive">
                {datesError}
              </p>
            )}
            {Boolean(city.trim()) &&
              !datesLoading &&
              datesLoaded &&
              shownDateOptions.length === 0 && (
                <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  {isTargeted
                    ? "No dates with free seats are available for this occupation right now."
                    : "No test center sites have free dates this month for this city. Try another city."}
                </p>
              )}

            {shownDateOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Available dates</p>
                <div className="flex flex-wrap gap-2">
                  {shownDateOptions.map((entry) => {
                    const active = activeDateValue === entry.date;
                    return (
                      <Button
                        key={entry.date}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => selectDateOption(entry)}
                      >
                        <CalendarDays className="mr-1 h-3.5 w-3.5" /> {formatDateOnly(entry.date)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeDateValue && (
              <div className="space-y-2">
                <SvpExamSessionsTable
                  views={sessionViews}
                  loading={sessionsLoading}
                  error={sessionsError}
                  loaded={sessionsLoaded}
                  targeted={isTargeted}
                  loadBalancer={Boolean(isLoadBalancer)}
                  onRetry={() => {
                    if (isTargeted) void sessionsQuery.refetch();
                    else void slotsQuery.refetch();
                  }}
                />
                {takamolRows.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Live availability · Takamol API</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateOnly(availabilityDate)} · {availabilityCity} ·{" "}
                          {activeLanguageLabel}
                        </p>
                      </div>
                      <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                        Reference only
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full min-w-[34rem] text-left text-sm">
                        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Test center</th>
                            <th className="px-3 py-2">Time</th>
                            <th className="px-3 py-2">Seats</th>
                            <th className="px-3 py-2">Slot</th>
                            <th className="px-3 py-2">Language</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {takamolRows.map((row) => (
                            <tr key={row.id}>
                              <td className="px-3 py-2">{row.centerName}</td>
                              <td className="px-3 py-2 font-medium">{row.examTime}</td>
                              <td className="px-3 py-2">{row.seats}</td>
                              <td className="px-3 py-2">{row.examSlot}</td>
                              <td className="px-3 py-2">{activeLanguageLabel}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Reference availability from the Takamol API. The reservation is created with
                      the SVP session you select above.
                    </p>
                  </div>
                )}

                {isTargeted && isLoadBalancer && examSessions.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    SVP will assign one of these {examSessions.length} sessions for the selected
                    date.
                  </p>
                )}
                {!isTargeted && holdId && (
                  <p className="text-xs text-muted-foreground">
                    SVP has held this slot for you. Continue to confirm the booking.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setStage("select")}>
                <RotateCcw className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                type="button"
                onClick={continueFromDates}
                disabled={
                  !city.trim() ||
                  !activeDateValue ||
                  sessionsLoading ||
                  Boolean(sessionsError) ||
                  !sessionsLoaded ||
                  (isTargeted && isLoadBalancer ? examSessions.length === 0 : !selectedSession) ||
                  (!(isTargeted && isLoadBalancer) &&
                    !sessionViews.some((view) => view.selected && view.seats !== 0)) ||
                  holdMutation.isPending ||
                  targetedHoldMutation.isPending
                }
              >
                {(holdMutation.isPending || targetedHoldMutation.isPending) && (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                )}
                Continue
              </Button>
            </div>
          </section>
        )}

        {!addAccountOpen &&
          !rescheduleId &&
          stage === "confirm" &&
          selectedSession &&
          occupation && (
            <section className="card-surface space-y-4 p-4 sm:p-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <h2 className="text-xl font-bold">Step 3 · Confirm the booking</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  The reservation is created with the real SVP API for this signed-in account.
                </p>
              </div>

              <dl className="grid gap-2 rounded-xl border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Occupation</dt>
                  <dd className="font-medium">{occupation.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Date and time</dt>
                  <dd className="font-medium">{formatSlot(selectedSession.startAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Test center</dt>
                  <dd className="font-medium">
                    {selectedSession.centerName ?? selectedSession.city ?? city}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Language</dt>
                  <dd className="font-medium">{activeLanguageCode}</dd>
                </div>
              </dl>

              {isTargeted && targetedHoldExpiresAt && (
                <p className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> Seat held by SVP until{" "}
                  {formatHoldExpiry(targetedHoldExpiresAt)}. Complete the booking to confirm it.
                </p>
              )}
              {!isTargeted && holdId && (
                <p className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> Slot held by SVP
                  {prometricHoldExpiresAt
                    ? ` until ${formatHoldExpiry(prometricHoldExpiresAt)}`
                    : ""}
                  . Complete the booking to confirm it.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Candidate name *">
                  <Input
                    value={candidateName}
                    maxLength={120}
                    autoComplete="off"
                    required
                    disabled={bookingMutation.isPending}
                    onChange={(event) => setCandidateName(event.target.value)}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Passport *">
                  <Input
                    value={passport}
                    maxLength={20}
                    autoComplete="off"
                    required
                    pattern="[A-Za-z0-9]{5,20}"
                    disabled={bookingMutation.isPending}
                    aria-invalid={Boolean(passport.trim()) && !candidateValidation.success}
                    onChange={(event) => setPassport(event.target.value)}
                    placeholder="Passport number"
                  />
                </Field>
                <Field label="Agency">
                  <Input
                    value={agency}
                    maxLength={120}
                    disabled={bookingMutation.isPending}
                    onChange={(event) => setAgency(event.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Name and passport are filled automatically when supplied by this SVP account. Review
                them or complete any missing details. Agency is optional. The local record is saved
                automatically only after SVP creates the reservation.
              </p>
              {passport.trim() && !/^[A-Za-z0-9]{5,20}$/.test(passport.trim()) && (
                <p role="alert" className="text-xs text-destructive">
                  Use 5–20 letters and numbers for the passport.
                </p>
              )}

              {occupation.driverLicenseRequired && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  This occupation requires a driver license upload. Complete this booking in the
                  official SVP portal instead.
                </p>
              )}

              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={accepted}
                  disabled={bookingMutation.isPending}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                <span>
                  I confirm the candidate details are correct and accept the SVP booking and refund
                  rules.
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStage("dates")}
                  disabled={bookingMutation.isPending}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!bookingSubmittedRef.current) bookingMutation.mutate();
                  }}
                  disabled={
                    !candidateValidation.success ||
                    !accepted ||
                    occupation.driverLicenseRequired ||
                    bookingMutation.isPending
                  }
                >
                  {bookingMutation.isPending && (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create SVP booking
                </Button>
              </div>
            </section>
          )}

        {!addAccountOpen && !rescheduleId && stage === "done" && result && (
          <section className="card-surface space-y-3 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Reservation created</h2>
                <p className="text-sm text-muted-foreground">
                  SVP reservation number: {result.reservationId}
                </p>
              </div>
            </div>
            <p className="rounded-lg border bg-muted/30 p-3 text-sm">{result.message}</p>
            {localSaveStatus === "saving" && (
              <p role="status" className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Saving the local reservation
                record automatically…
              </p>
            )}
            {localSaveStatus === "saved" && (
              <p
                role="status"
                className="rounded-lg border bg-success-soft p-3 text-sm text-success"
              >
                Local reservation record saved automatically.
              </p>
            )}
            {localSaveStatus === "failed" && (
              <div
                role="alert"
                className="space-y-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950"
              >
                <p>
                  SVP created the reservation, but the local record was not saved. Do not book
                  again.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (localRecordRef.current) void saveLocalRecord(localRecordRef.current);
                  }}
                >
                  Retry local save
                </Button>
                <p className="text-xs">
                  This retries the local record only; it does not create another SVP reservation.
                </p>
              </div>
            )}
            {result.paymentRequired && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                The reservation is not confirmed until payment is completed in the official SVP
                portal.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={resetFlow} disabled={localSaveStatus !== "saved"}>
                Book another
              </Button>
              {!result.paymentRequired && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void downloadTicketById(
                      result.reservationId,
                      status?.userName ?? candidateName,
                      occupation?.name ?? null,
                    )
                  }
                  disabled={downloadingId === result.reservationId}
                >
                  {downloadingId === result.reservationId ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Download ticket PDF
                </Button>
              )}
              <a href={SVP_PORTAL_BOOKING_URL} target="_blank" rel="noreferrer">
                <Button type="button" variant="outline">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open SVP portal
                </Button>
              </a>
            </div>
          </section>
        )}

        <section
          className="card-surface space-y-3 p-4 sm:p-5"
          aria-labelledby="svp-account-bookings"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Official reservations
              </p>
              <h2 id="svp-account-bookings" className="text-lg font-bold">
                SVP bookings on this account
              </h2>
              <p className="text-xs text-muted-foreground">
                {reservations.length} total
                {cancelledReservations > 0 ? ` · ${cancelledReservations} cancelled` : ""}
              </p>
            </div>
            {reservationsQuery.isFetching && (
              <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {reservationsQuery.data && !reservationsQuery.data.ok && (
            <p role="alert" className="text-sm text-destructive">
              {reservationsQuery.data.message}
            </p>
          )}
          {reservations.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No SVP bookings found for this account.
            </p>
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border bg-background/40">
              {reservations.map((entry) => {
                const ticketReady = entry.status
                  ? /reserved|completed|confirmed/i.test(entry.status)
                  : false;
                return (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-sm transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <UserRound className="mr-1 inline h-4 w-4" />{" "}
                        {entry.occupationName ?? "Occupation"} · #{entry.id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.startAt ? formatSlot(entry.startAt) : "Date not set"}
                        {(entry.centerName ?? entry.city)
                          ? ` · ${entry.centerName ?? entry.city}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(entry.status)}`}
                      >
                        {entry.status ?? "unknown"}
                      </span>
                      {entry.canBeRescheduled ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setRescheduleId(entry.id)}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reschedule
                        </Button>
                      ) : (
                        <span
                          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                          title="SVP marks this booking as not reschedulable"
                        >
                          Not reschedulable
                        </span>
                      )}
                      {ticketReady && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void downloadTicketById(
                              entry.id,
                              entry.laborName ?? status?.userName ?? candidateName,
                              entry.occupationEnglishName ?? entry.occupationName,
                            )
                          }
                          disabled={downloadingId === entry.id}
                        >
                          {downloadingId === entry.id ? (
                            <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="mr-1 h-3.5 w-3.5" />
                          )}
                          Ticket PDF
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
