import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
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
import { supabase } from "@/integrations/supabase/client";
import {
  checkSvpBookingEligibility,
  createSvpBooking,
  createSvpPrometricHold,
  createSvpTargetedHold,
  downloadSvpTicket,
  getSvpAccountOverview,
  getSvpBookingSetup,
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
} from "@/lib/svp-booking.functions";
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
import { normalizeSvpBookingForm, toSvpBookingInsert } from "@/lib/svp-booking.shared";

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

function SummaryRow({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof BriefcaseBusiness;
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium">{value}</p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function BookingSummary({
  accountName,
  accountLogin,
  countryName,
  flow,
  occupation,
  city,
  date,
  session,
  price,
  credits,
  freeReservations,
}: {
  accountName: string | null;
  accountLogin: string | null;
  countryName: string | null;
  flow: string;
  occupation: SvpOccupation | null;
  city: string;
  date: string;
  session: SvpExamSession | null;
  price: number | null;
  credits: number;
  freeReservations: boolean;
}) {
  return (
    <aside className="card-surface space-y-4 p-4 xl:sticky xl:top-4" aria-label="Booking summary">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Live booking
        </p>
        <h2 className="text-lg font-bold">Booking summary</h2>
      </div>

      <div className="space-y-3 border-t pt-3">
        <SummaryRow
          icon={UserRound}
          label="SVP account"
          value={accountName ?? accountLogin ?? "Not signed in"}
          detail={accountLogin}
        />
        <SummaryRow
          icon={Building2}
          label="Country · flow"
          value={countryName ?? "—"}
          detail={flow}
        />
        <SummaryRow
          icon={BriefcaseBusiness}
          label="Occupation"
          value={occupation?.name ?? "Choose an occupation"}
          detail={occupation?.categoryName ?? null}
        />
        <SummaryRow
          icon={Building2}
          label="Test center"
          value={city || "Any city"}
          detail={session?.centerName ?? null}
        />
        <SummaryRow
          icon={CalendarDays}
          label="Date & session"
          value={date ? formatDateOnly(date) : "Choose a date"}
          detail={session ? formatSlot(session.startAt) : null}
        />
        <SummaryRow
          icon={CreditCard}
          label="Payment"
          value={
            freeReservations
              ? "Free reservation"
              : credits > 0
                ? `${credits} SVP credit(s)`
                : "SVP payment"
          }
          detail={price !== null ? `Test price: ${price} SAR` : null}
        />
      </div>

      <p className="rounded-lg border border-border/70 bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Reservations and seat holds are created directly through the official SVP API for the active
        account.
      </p>
    </aside>
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

  const invalidateSvpData = useCallback(() => {
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
    status?.countryTargeted ??
    overview?.permissions.targeted ??
    setup?.permissions.targeted ??
    true;
  const isLoadBalancer =
    status?.countryLoadBalancer ??
    overview?.permissions.loadBalancer ??
    setup?.permissions.loadBalancer ??
    false;
  const languageOptions = useMemo(() => {
    const all = occupation?.languages ?? [];
    const filtered = all.filter((entry) => entry.nonTargeted === !isTargeted);
    const source = filtered.length > 0 ? filtered : all;
    const byLabel = new Map<string, (typeof all)[number]>();
    for (const entry of source) {
      const key = entry.label.toLowerCase();
      const existing = byLabel.get(key);
      if (!existing || (entry.questionCount ?? 0) > (existing.questionCount ?? 0)) {
        byLabel.set(key, entry);
      }
    }
    return [...byLabel.values()];
  }, [isTargeted, occupation]);
  const activeLanguageCode =
    languageCode && languageOptions.some((entry) => entry.code === languageCode)
      ? languageCode
      : (languageOptions[0]?.code ?? occupation?.languages[0]?.code ?? "en");

  const citiesQuery = useQuery({
    queryKey: ["svp-cities"],
    queryFn: () => listSvpTestCenterCities(),
    enabled: signedIn && overview !== null && !isTargeted && occupationId !== null,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const cities = citiesQuery.data?.ok ? citiesQuery.data.data : [];

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

  const categoryId = occupation?.categoryId ?? null;
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
  const targetedCities = useMemo(
    () => [
      ...new Set(
        availableDates
          .map((entry) => entry.city)
          .filter((entry): entry is string => Boolean(entry)),
      ),
    ],
    [availableDates],
  );
  const dateOptions = useMemo(() => {
    const map = new Map<string, { date: string; city: string | null }>();
    for (const entry of availableDates) {
      const { date } = splitDateTime(entry.startAt);
      if (!date || map.has(date)) continue;
      map.set(date, { date, city: entry.city });
    }
    return [...map.values()];
  }, [availableDates]);

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
    enabled: signedIn && checked && !isTargeted && Boolean(city),
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

  const selectOccupation = (entry: SvpOccupation) => {
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
    setStage("select");
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
      if (!occupation?.categoryId) throw new Error("Select an occupation first.");
      const ids = isLoadBalancer
        ? examSessions.map((entry) => entry.id)
        : selectedSession
          ? [selectedSession.id]
          : [];
      if (ids.length === 0) throw new Error("Select an exam session first.");

      const response = await createSvpTargetedHold({
        data: {
          examSessionId: isLoadBalancer ? ids : (ids[0] as string | number),
          categoryId: occupation.categoryId,
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
            (!entry.city || candidate.city === entry.city),
        ) ?? null;
      setSelectedDate(nextDate);
      if (entry.city) {
        setCity(entry.city);
        setCityCountryId(
          cities.find((candidate) => candidate.city === entry.city)?.countryId ?? null,
        );
      }
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
    if (isTargeted) {
      void datesQuery.refetch();
      if (activeDateValue) void sessionsQuery.refetch();
      return;
    }
    void sitesQuery.refetch();
    if (prometricDate) void slotsQuery.refetch();
  };

  const startNewBooking = () => {
    resetFlow();
    setAddAccountOpen(false);
    setRescheduleId(null);
    setStage("select");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetFlow = () => {
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
    setCandidateName("");
    setPassport("");
    setAgency("");
    setAccepted(false);
    setResult(null);
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

  const saveLocalRecord = async (booking: SvpBookingResult) => {
    if (!occupation || !selectedSession) return;
    const { date, time } = splitDateTime(selectedSession.startAt);
    try {
      const normalized = normalizeSvpBookingForm({
        candidate_name: candidateName,
        passport,
        occupation: occupation.name,
        center: selectedSession.centerName ?? sessionCity,
        exam_date: date,
        exam_time: time,
        agency,
        login_email: status?.login?.includes("@") ? status.login : "",
        reference_no: booking.reservationId,
        notes: `SVP ${booking.reservationId}: ${booking.message}`,
        status: date && time ? "booked" : "draft",
      });
      const { error } = await supabase.from("svp_bookings").insert(toSvpBookingInsert(normalized));
      if (error) throw error;
      toast.success("Saved to the manual record tracker");
    } catch {
      toast.error("Booked in SVP, but the local record could not be saved.");
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

  const bookingMutation = useMutation({
    mutationFn: async (): Promise<SvpBookingResult> => {
      if (!occupation || !selectedSession) throw new Error("Select an exam session first.");
      const response = await createSvpBooking({
        data: {
          occupationId: occupation.id,
          categoryId: occupation.categoryId as number,
          examSessionId: isTargeted ? selectedSession.id : (prometricExamId ?? selectedSession.id),
          languageCode: activeLanguageCode,
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
      return response.data;
    },
    onSuccess: async (booking) => {
      setResult(booking);
      setStage("done");
      await saveLocalRecord(booking);
      void queryClient.invalidateQueries({ queryKey: ["svp-reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["svp-account-overview"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The SVP reservation failed."),
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
  const datesLoading = isTargeted ? datesQuery.isPending : sitesQuery.isPending;
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
  const sessionViews = isTargeted
    ? examSessions.map((entry) => ({
        key: `s-${entry.id}`,
        startAt: entry.startAt,
        center: entry.centerName ?? entry.city ?? city,
        seats: entry.availableSeats,
        duration: entry.duration,
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
          center: site?.name ?? site?.city ?? city,
          seats: null as number | null,
          duration: slot.duration,
          selected: selectedSlot?.id === slot.id,
          onSelect: () => chooseSlot(slot),
        };
      });
  const sessionsLoading = isTargeted ? sessionsQuery.isPending : slotsQuery.isPending;
  const sessionsError = isTargeted
    ? sessionsQuery.data && !sessionsQuery.data.ok
      ? sessionsQuery.data.message
      : null
    : slotsQuery.data && !slotsQuery.data.ok
      ? slotsQuery.data.message
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
              Official SVP API · live
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
            <Button type="button" size="sm" onClick={startNewBooking}>
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

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
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

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Occupation *">
                  <div className="relative">
                    <Input
                      value={occupationSearch}
                      onChange={(event) => {
                        setOccupationSearch(event.target.value);
                        setOccupationOpen(true);
                      }}
                      onFocus={() => setOccupationOpen(true)}
                      onBlur={() => window.setTimeout(() => setOccupationOpen(false), 180)}
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
                        {suggestions.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectOccupation(entry)}
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
                  {occupation && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Selected: {occupation.name}
                      {occupation.occupationKey ? ` · ${occupation.occupationKey}` : ""}
                      {occupation.categoryId ? ` · category ${occupation.categoryId}` : ""}
                    </p>
                  )}
                </Field>
                <Field label={isTargeted ? "Test center city" : "Test center city *"}>
                  {isTargeted ? (
                    <NativeSelect
                      value={city}
                      onChange={(event) => {
                        setCity(event.target.value);
                        setPrometricDate(null);
                        setSelectedSlot(null);
                        setSelectedSession(null);
                        setHoldId(null);
                        setPrometricHoldExpiresAt(null);
                        setTargetedHoldExpiresAt(null);
                      }}
                    >
                      <option value="">All cities (from SVP availability)</option>
                      {targetedCities.map((entry) => (
                        <option key={entry} value={entry}>
                          {entry}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : cities.length > 0 ? (
                    <NativeSelect
                      value={city}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCity(value);
                        setCityCountryId(
                          cities.find((entry) => entry.city === value)?.countryId ?? null,
                        );
                        setPrometricDate(null);
                        setSelectedSlot(null);
                        setSelectedSession(null);
                        setHoldId(null);
                        setPrometricHoldExpiresAt(null);
                        setTargetedHoldExpiresAt(null);
                      }}
                      required
                    >
                      <option value="">Select a city</option>
                      {cities.map((entry) => (
                        <option key={`${entry.city}-${entry.countryId ?? ""}`} value={entry.city}>
                          {entry.city}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      placeholder="City name, e.g. Dhaka"
                      required
                    />
                  )}
                </Field>
                {languageOptions.length > 1 && (
                  <Field label="Exam language">
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
                  </Field>
                )}
              </div>

              {occupationsQuery.isPending && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading occupations from
                  SVP…
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
              {occupationsQuery.data?.ok && occupations.length === 0 && (
                <div
                  className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <span>SVP returned no occupations for this account.</span>
                  <Button type="button" size="sm" variant="outline" onClick={retryOccupations}>
                    Reload
                  </Button>
                </div>
              )}
              {citiesQuery.data && !citiesQuery.data.ok && !isTargeted && (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-2 text-xs text-amber-950"
                  role="status"
                >
                  <span>
                    City list unavailable — type the city manually. ({citiesQuery.data.message})
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={retryOccupations}>
                    Retry
                  </Button>
                </div>
              )}
              {occupation && !occupation.categoryId && (
                <p role="alert" className="text-sm text-destructive">
                  This occupation has no SVP category, so it cannot be booked online.
                </p>
              )}
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
                    !occupation.categoryId ||
                    (!isTargeted && !city.trim()) ||
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
              {!datesLoading && datesLoaded && shownDateOptions.length === 0 && (
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
                  <p className="text-sm font-medium">
                    {isTargeted ? "Exam sessions" : "Available slots"}
                  </p>
                  {sessionsLoading && (
                    <p
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                      role="status"
                    >
                      <LoaderCircle className="h-4 w-4 animate-spin" /> Loading sessions…
                    </p>
                  )}
                  {sessionsError && (
                    <p role="alert" className="text-sm text-destructive">
                      {sessionsError}
                    </p>
                  )}
                  {!sessionsLoading && sessionsLoaded && sessionViews.length === 0 && (
                    <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                      {isTargeted
                        ? "No sessions with free seats on this date."
                        : "No slots with free seats on this date."}
                    </p>
                  )}
                  <div className="grid gap-2 md:grid-cols-2">
                    {sessionViews.map((view) => (
                      <button
                        key={view.key}
                        type="button"
                        onClick={view.onSelect}
                        className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                          view.selected
                            ? "border-primary bg-primary-soft"
                            : "bg-card hover:border-primary/50"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{formatSlot(view.startAt)}</span>
                          {view.selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </span>
                        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" /> {view.center}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {view.seats !== null ? `Seats: ${view.seats} · ` : ""}Duration:{" "}
                          {view.duration || "—"}
                          {isTargeted ? "s" : " min"}
                        </span>
                      </button>
                    ))}
                  </div>
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
                    (isTargeted && isLoadBalancer ? examSessions.length === 0 : !selectedSession) ||
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
                      onChange={(event) => setPassport(event.target.value)}
                      placeholder="Passport number"
                    />
                  </Field>
                  <Field label="Agency">
                    <Input
                      value={agency}
                      maxLength={120}
                      onChange={(event) => setAgency(event.target.value)}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Candidate name and passport are required for the local record that is saved after
                  the SVP booking succeeds.
                </p>

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
                    onChange={(event) => setAccepted(event.target.checked)}
                  />
                  <span>
                    I confirm the candidate details are correct and accept the SVP booking and
                    refund rules.
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
                    onClick={() => bookingMutation.mutate()}
                    disabled={
                      !candidateName.trim() ||
                      !passport.trim() ||
                      !accepted ||
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
              {result.paymentRequired && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  The reservation is not confirmed until payment is completed in the official SVP
                  portal.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={resetFlow}>
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

        <BookingSummary
          accountName={status?.userName ?? null}
          accountLogin={status?.login ?? null}
          countryName={overview?.permissions.countryName ?? setup?.permissions.countryName ?? null}
          flow={isTargeted ? `Targeted${isLoadBalancer ? " · load balanced" : ""}` : "Site-based"}
          occupation={occupation}
          city={city}
          date={activeDateValue}
          session={selectedSession}
          price={overview?.permissions.testPrice ?? null}
          credits={overview?.credits ?? 0}
          freeReservations={
            overview?.permissions.freeReservations ?? setup?.permissions.freeReservations ?? false
          }
        />
      </div>
    </div>
  );
}
