import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  LoaderCircle,
  LogOut,
  MapPin,
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
  downloadSvpTicket,
  getSvpAccountOverview,
  getSvpBookingSetup,
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
import { getSvpSessionStatus, signOutSvpSession } from "@/lib/svp-session.functions";
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

function hashSlotId(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash || 1;
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

export function SvpBookingWizard() {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => getSvpSessionStatus(),
    retry: false,
  });
  const status = sessionQuery.data;
  const [needsLogin, setNeedsLogin] = useState(false);
  const signedIn = Boolean(status?.signedIn) && !needsLogin;

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
  const [candidateName, setCandidateName] = useState("");
  const [passport, setPassport] = useState("");
  const [agency, setAgency] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [result, setResult] = useState<SvpBookingResult | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);

  const requireSignIn = () => {
    setNeedsLogin(true);
    void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
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
    enabled: signedIn && debouncedOccupationSearch.length >= 2,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const searchResults = useMemo(
    () => (occupationSearchQuery.data?.ok ? occupationSearchQuery.data.data : []),
    [occupationSearchQuery.data],
  );
  const suggestions = useMemo(() => {
    if (debouncedOccupationSearch.length < 2) return filteredOccupations.slice(0, 12);
    const merged = new Map<number, SvpOccupation>();
    for (const entry of [...searchResults, ...filteredOccupations]) {
      if (!merged.has(entry.id)) merged.set(entry.id, entry);
    }
    return [...merged.values()].slice(0, 40);
  }, [debouncedOccupationSearch, filteredOccupations, searchResults]);
  const occupationSearchPending =
    occupationSearch.trim() !== debouncedOccupationSearch || occupationSearchQuery.isFetching;

  const citiesQuery = useQuery({
    queryKey: ["svp-cities"],
    queryFn: () => listSvpTestCenterCities(),
    enabled: signedIn,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const cities = citiesQuery.data?.ok ? citiesQuery.data.data : [];

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
  const isTargeted = overview
    ? overview.permissions.targeted
    : (setup?.permissions.targeted ?? true);

  // Any SVP call can invalidate the stored session (refresh cookie expired/revoked).
  useEffect(() => {
    const results = [occupationsQuery.data, citiesQuery.data, setupQuery.data, overviewQuery.data];
    if (results.some((result) => result && !result.ok && result.needsSignIn)) {
      setNeedsLogin(true);
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    }
  }, [citiesQuery.data, occupationsQuery.data, overviewQuery.data, queryClient, setupQuery.data]);

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

  const prometricCode = languageCode || occupation?.languages[0]?.code || "en";
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

  const selectOccupation = (entry: SvpOccupation) => {
    setSelectedOccupation(entry);
    setOccupationId(entry.id);
    setLanguageCode(entry.languages[0]?.code ?? "");
    setOccupationSearch(entry.name);
    setOccupationOpen(false);
    setChecked(false);
    setEligibility(null);
    setSelectedDate(null);
    setSelectedSession(null);
    setPrometricDate(null);
    setSelectedSlot(null);
    setHoldId(null);
    setStage("select");
  };

  const chooseSlot = (slot: SvpPrometricSlot) => {
    const site = prometricSites.find((entry) => entry.siteId === slot.siteId) ?? null;
    const numeric = Number(slot.id);
    setSelectedSlot(slot);
    setSelectedSession({
      id: Number.isFinite(numeric) ? numeric : hashSlotId(slot.id),
      startAt: slot.startAt,
      endAt: null,
      duration: slot.duration,
      availableSeats: null,
      city: site?.city ?? city,
      centerName: site?.name ?? null,
      siteId: slot.siteId,
    });
    setHoldId(null);
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
      setStage("confirm");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "SVP could not hold the slot."),
  });

  const continueFromDates = () => {
    if (isTargeted) {
      setStage("confirm");
      return;
    }
    holdMutation.mutate();
  };

  const selectDateOption = (entry: { date: string; city: string | null }) => {
    setSelectedSession(null);
    setSelectedSlot(null);
    setHoldId(null);
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
          languageCode: languageCode || occupation.languages[0]?.code || "en",
          duration: selectedSession.duration,
          startAt: selectedSession.startAt,
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
    mutationFn: () => signOutSvpSession(),
    onSuccess: () => {
      setNeedsLogin(false);
      resetFlow();
      queryClient.removeQueries({ queryKey: ["svp-occupations"] });
      queryClient.removeQueries({ queryKey: ["svp-cities"] });
      queryClient.removeQueries({ queryKey: ["svp-reservations"] });
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      toast.success("Signed out of SVP");
    },
    onError: () => toast.error("Could not sign out of SVP."),
  });

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
        {sessionQuery.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            The SVP session could not be checked. Sign in again.
          </p>
        )}
        {needsLogin && (
          <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">
            Your SVP session expired. Sign in with the candidate&apos;s SVP username and password.
          </p>
        )}
        <SvpLoginPanel
          onSignedIn={() => {
            setNeedsLogin(false);
            void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
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
              onClick={() => signOutMutation.mutate()}
              disabled={signOutMutation.isPending}
            >
              <LogOut className="mr-1 h-4 w-4" /> Sign out of SVP
            </Button>
          </div>
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

      {!rescheduleId && stage === "select" && (
        <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div>
            <h2 className="text-xl font-bold">Step 1 · Occupation and test center</h2>
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
                  disabled={occupationsQuery.isPending}
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
                      debouncedOccupationSearch.length >= 2 &&
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
            <Field label="Test center city *">
              {cities.length > 0 ? (
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
            {occupation && occupation.languages.length > 1 && (
              <Field label="Exam language">
                <NativeSelect
                  value={languageCode}
                  onChange={(event) => setLanguageCode(event.target.value)}
                >
                  {occupation.languages.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>

          {occupationsQuery.data && !occupationsQuery.data.ok && (
            <p role="alert" className="text-sm text-destructive">
              {occupationsQuery.data.message}
            </p>
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
              Free reservations: {setup.permissions.freeReservations ? "yes" : "no"} · SVP credits:{" "}
              {setup.credits}
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
                !city.trim() ||
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

      {!rescheduleId && stage === "dates" && (
        <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div>
            <h2 className="text-xl font-bold">Step 2 · Choose the exam session</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {occupation?.name} · {city}
              {activeDateValue ? ` · ${formatDateOnly(activeDateValue)}` : ""}
            </p>
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
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
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
              disabled={!selectedSession || holdMutation.isPending}
            >
              {holdMutation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </div>
        </section>
      )}

      {!rescheduleId && stage === "confirm" && selectedSession && occupation && (
        <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div>
            <h2 className="text-xl font-bold">Step 3 · Confirm the booking</h2>
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
              <dd className="font-medium">
                {languageCode || occupation.languages[0]?.code || "en"}
              </dd>
            </div>
          </dl>

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
            Candidate name and passport are required for the local record that is saved after the
            SVP booking succeeds.
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
              onClick={() => bookingMutation.mutate()}
              disabled={
                !candidateName.trim() || !passport.trim() || !accepted || bookingMutation.isPending
              }
            >
              {bookingMutation.isPending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              Create SVP booking
            </Button>
          </div>
        </section>
      )}

      {!rescheduleId && stage === "done" && result && (
        <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
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

      <section className="space-y-3" aria-labelledby="svp-account-bookings">
        <div className="flex items-center justify-between gap-2">
          <h2 id="svp-account-bookings" className="text-lg font-bold">
            SVP bookings on this account
          </h2>
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
          <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No SVP bookings found for this account.
          </p>
        ) : (
          <div className="divide-y rounded-2xl border bg-card">
            {reservations.map((entry) => {
              const ticketReady = entry.status
                ? /reserved|completed|confirmed/i.test(entry.status)
                : false;
              return (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
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
                    {entry.canBeRescheduled &&
                      (overview === null ||
                        (overview.flags.rescheduleEnabled &&
                          overview.constraints.rescheduleTimes > 0)) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setRescheduleId(entry.id)}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reschedule
                        </Button>
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
  );
}
