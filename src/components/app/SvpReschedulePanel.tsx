import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/app/ui-bits";
import {
  getSvpReservationDetail,
  listSvpExamSessions,
  listSvpPrometricSites,
  listSvpPrometricSlots,
  listSvpRescheduleDates,
  rescheduleSvpBooking,
  rescheduleSvpSiteBooking,
} from "@/lib/svp-booking.functions";
import type {
  SvpAvailableDate,
  SvpExamSession,
  SvpPrometricSite,
  SvpPrometricSlot,
} from "@/lib/svp-api.shared";
import { lookupTakamolAvailability } from "@/lib/takamol-availability.functions";
import {
  mapTakamolRowsToSvpSlots,
  parseCities,
  parseTakamolRescheduleRows,
  parseTestCenters,
} from "@/lib/takamol-availability.ui";

const MANUAL_CITY_OPTION = "__manual_city__";

function splitDateTime(value: string): { date: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  if (match) return { date: match[1] ?? "", time: match[2] ?? "" };
  return { date: value.slice(0, 10), time: "" };
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSlot(value: string): string {
  const { date, time } = splitDateTime(value);
  return `${formatDate(date)}${time ? ` · ${time}` : ""}`;
}

function hashSlotId(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash || 1;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthOptions(now = new Date()): Array<{ value: string; label: string }> {
  return Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return {
      value: monthKey(date),
      label: new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
    };
  });
}

export function SvpReschedulePanel({
  reservationId,
  rescheduleTimes,
  countryId,
  categoryId,
  isTargeted = true,
  onCancel,
  onDone,
  onReconnect,
}: {
  reservationId: string;
  rescheduleTimes: number | null;
  countryId?: number | null;
  categoryId?: number | null;
  isTargeted?: boolean;
  onCancel: () => void;
  onReconnect?: () => void;
  onDone: (
    result: { startAt: string; city: string | null; centerName: string | null } | null,
  ) => void;
}) {
  const queryClient = useQueryClient();
  const [city, setCity] = useState("");
  const [manualCityMode, setManualCityMode] = useState(false);
  const [manualCityName, setManualCityName] = useState("");
  const [languageCode, setLanguageCode] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [selectedDate, setSelectedDate] = useState<SvpAvailableDate | null>(null);
  const [selectedSession, setSelectedSession] = useState<SvpExamSession | null>(null);
  const [prometricDate, setPrometricDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SvpPrometricSlot | null>(null);
  const [done, setDone] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["svp-reservation-detail", reservationId],
    queryFn: () => getSvpReservationDetail({ data: { reservationId } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const detail = detailQuery.data?.ok ? detailQuery.data.data : null;
  const languageOptions = useMemo(() => {
    const all = detail?.languages ?? [];
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
  }, [detail, isTargeted]);
  const activeLanguage =
    languageCode && languageOptions.some((entry) => entry.code === languageCode)
      ? languageCode
      : detail?.languageCode && languageOptions.some((entry) => entry.code === detail.languageCode)
        ? detail.languageCode
        : (languageOptions[0]?.code ?? "en");
  const effectiveCountryId = detail?.countryId ?? countryId ?? null;
  const effectiveCategoryId = detail?.categoryId ?? categoryId ?? null;
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const selectedMonthLabel =
    monthOptions.find((entry) => entry.value === selectedMonth)?.label ?? selectedMonth;

  const datesQuery = useQuery({
    queryKey: ["svp-reschedule-dates", reservationId, effectiveCategoryId, effectiveCountryId],
    queryFn: () =>
      listSvpRescheduleDates({
        data: {
          reservationId,
          categoryId: effectiveCategoryId as number,
          countryId: effectiveCountryId,
        },
      }),
    enabled: isTargeted && effectiveCategoryId != null,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const dates = useMemo(() => (datesQuery.data?.ok ? datesQuery.data.data : []), [datesQuery.data]);
  const dateOptions = useMemo(() => {
    const map = new Map<string, SvpAvailableDate>();
    for (const entry of dates) {
      if (city && entry.city !== city) continue;
      const { date } = splitDateTime(entry.startAt);
      if (date && !map.has(date)) map.set(date, entry);
    }
    return [...map.values()];
  }, [city, dates]);

  const citiesQuery = useQuery({
    queryKey: ["takamol-reschedule-cities", effectiveCategoryId],
    queryFn: () =>
      lookupTakamolAvailability({
        data: { endpoint: "cities", categoryId: String(effectiveCategoryId) },
      }),
    enabled: !isTargeted && effectiveCategoryId != null,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const takamolCities = useMemo(
    () => (citiesQuery.data?.success ? parseCities(citiesQuery.data.data) : []),
    [citiesQuery.data],
  );
  const cityListError =
    citiesQuery.data && !citiesQuery.data.success
      ? citiesQuery.data.message
      : citiesQuery.isError
        ? "The Takamol city lookup failed."
        : effectiveCategoryId == null
          ? "A category is required to load Takamol cities."
          : null;
  const cityListEmpty = Boolean(citiesQuery.data?.success && takamolCities.length === 0);
  const cityFallbackOnly = Boolean(
    detail?.city && !citiesQuery.isFetching && (cityListError || cityListEmpty),
  );

  const centersQuery = useQuery({
    queryKey: ["takamol-reschedule-centers", city],
    queryFn: () => lookupTakamolAvailability({ data: { endpoint: "centers", city } }),
    enabled: !isTargeted && Boolean(city),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const centersErrorMessage =
    centersQuery.data && !centersQuery.data.success ? centersQuery.data.message : null;
  const takamolCenters = useMemo(
    () => (centersQuery.data?.success ? parseTestCenters(centersQuery.data.data) : []),
    [centersQuery.data],
  );

  const takamolSessionsQuery = useQuery({
    queryKey: ["takamol-reschedule-sessions", effectiveCategoryId, city, prometricDate],
    queryFn: () =>
      lookupTakamolAvailability({
        data: {
          endpoint: "sessions",
          categoryId: String(effectiveCategoryId),
          city,
          examDate: prometricDate as string,
        },
      }),
    enabled: !isTargeted && effectiveCategoryId != null && Boolean(city) && Boolean(prometricDate),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const takamolSessionRows = useMemo(
    () =>
      takamolSessionsQuery.data?.success
        ? parseTakamolRescheduleRows(
            takamolSessionsQuery.data.data,
            takamolCenters,
            city,
            prometricDate,
          )
        : [],
    [city, prometricDate, takamolCenters, takamolSessionsQuery.data],
  );
  // Mirror new booking: SVP site dates and slots drive the safe reschedule selection. Takamol
  // rows are used only as optional availability metadata, never to guess an SVP slot identifier.
  const sitesQuery = useQuery({
    queryKey: ["svp-reschedule-sites", activeLanguage, city, effectiveCountryId, selectedMonth],
    queryFn: () =>
      listSvpPrometricSites({
        data: {
          prometricCode: activeLanguage,
          city,
          countryId: effectiveCountryId,
          month: selectedMonth,
        },
      }),
    enabled: !isTargeted && Boolean(city),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const prometricSites: SvpPrometricSite[] = useMemo(
    () => (sitesQuery.data?.ok ? sitesQuery.data.data.sites : []),
    [sitesQuery.data],
  );
  const prometricExamId = sitesQuery.data?.ok ? sitesQuery.data.data.examId : null;
  const siteDateOptions = useMemo(() => {
    const map = new Map<string, { date: string; city: string | null }>();
    const today = new Date().toISOString().slice(0, 10);
    for (const site of prometricSites) {
      for (const date of site.dates) {
        if (date.slice(0, 7) !== selectedMonth) continue;
        if (selectedMonth === today.slice(0, 7) && date < today) continue;
        if (!map.has(date)) map.set(date, { date, city: site.city ?? city });
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [city, prometricSites, selectedMonth]);
  const siteIdsForDate = prometricSites
    .filter((site) => prometricDate && site.dates.includes(prometricDate))
    .map((site) => site.siteId);

  const slotsQuery = useQuery({
    queryKey: ["svp-reschedule-slots", prometricExamId, prometricDate, siteIdsForDate.join(",")],
    queryFn: () =>
      listSvpPrometricSlots({
        data: {
          examId: prometricExamId as string,
          siteIds: siteIdsForDate,
          date: prometricDate as string,
        },
      }),
    enabled:
      !isTargeted &&
      Boolean(prometricExamId) &&
      Boolean(prometricDate) &&
      siteIdsForDate.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const prometricSlots: SvpPrometricSlot[] = useMemo(
    () => (slotsQuery.data?.ok ? slotsQuery.data.data : []),
    [slotsQuery.data],
  );
  const takamolSlotMappings = useMemo(
    () =>
      prometricDate
        ? mapTakamolRowsToSvpSlots(
            takamolSessionRows,
            prometricSites,
            prometricSlots,
            city,
            prometricDate,
          )
        : [],
    [city, prometricDate, prometricSites, prometricSlots, takamolSessionRows],
  );
  const sessionDate = selectedDate ? splitDateTime(selectedDate.startAt).date : "";
  const sessionCity = selectedDate?.city ?? city;
  const sessionsQuery = useQuery({
    queryKey: ["svp-reschedule-sessions", effectiveCategoryId, sessionCity, sessionDate],
    queryFn: () =>
      listSvpExamSessions({
        data: {
          categoryId: effectiveCategoryId as number,
          city: sessionCity,
          examDate: sessionDate,
        },
      }),
    enabled:
      isTargeted && effectiveCategoryId != null && Boolean(sessionCity) && Boolean(sessionDate),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const sessions = sessionsQuery.data?.ok ? sessionsQuery.data.data : [];

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSession) throw new Error("Choose a new session first.");
      if (isTargeted) {
        const response = await rescheduleSvpBooking({
          data: {
            reservationId,
            examSessionId: selectedSession.id,
            languageCode: activeLanguage,
          },
        });
        if (!response.ok) throw new Error(response.message);
        return response.data;
      }

      if (!selectedSlot?.siteId || !prometricExamId) {
        throw new Error("Choose a new slot first.");
      }
      const response = await rescheduleSvpSiteBooking({
        data: {
          reservationId,
          examId: prometricExamId,
          slotId: selectedSlot.id,
          siteId: selectedSlot.siteId,
          siteCity: selectedSession.city,
          languageCode: activeLanguage,
          duration: selectedSlot.duration,
          startAt: selectedSlot.startAt,
          categoryId: effectiveCategoryId as number,
          countryId: effectiveCountryId,
        },
      });
      if (!response.ok) throw new Error(response.message);
      return response.data;
    },
    onSuccess: () => {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ["svp-reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["svp-reservation-detail", reservationId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The reschedule failed."),
  });

  const resetSelection = () => {
    setSelectedDate(null);
    setSelectedSession(null);
    setPrometricDate(null);
    setSelectedSlot(null);
  };

  const selectCity = (value: string) => {
    resetSelection();
    if (value === MANUAL_CITY_OPTION) {
      setCity("");
      setManualCityName("");
      setManualCityMode(true);
      return;
    }
    setManualCityMode(false);
    setManualCityName("");
    setCity(value);
  };

  const applyManualCity = () => {
    const nextCity = manualCityName.trim().replace(/\s+/g, " ");
    if (!nextCity) return;
    resetSelection();
    setCity(nextCity);
    setManualCityMode(false);
  };

  const selectDateOption = (entry: { date: string; city: string | null }) => {
    setSelectedSession(null);
    setSelectedSlot(null);
    if (isTargeted) {
      setSelectedDate(
        dates.find(
          (candidate) =>
            splitDateTime(candidate.startAt).date === entry.date &&
            (!entry.city || candidate.city === entry.city),
        ) ?? null,
      );
      if (entry.city) setCity(entry.city);
      return;
    }
    setPrometricDate(entry.date);
  };

  const chooseSlot = useCallback(
    (slot: SvpPrometricSlot) => {
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
    },
    [city, prometricSites],
  );

  useEffect(() => {
    if (isTargeted || !prometricDate || selectedSlot || prometricSlots.length === 0) return;
    chooseSlot(prometricSlots[0]!);
  }, [chooseSlot, isTargeted, prometricDate, prometricSlots, selectedSlot]);

  if (detailQuery.isPending) {
    return (
      <section
        className="flex items-center gap-2 rounded-2xl border bg-card p-5 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="h-4 w-4 animate-spin" /> Loading reservation…
      </section>
    );
  }

  if (detailQuery.data && !detailQuery.data.ok) {
    return (
      <section className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <p role="alert" className="text-sm text-destructive">
          {detailQuery.data.message}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X className="mr-1 h-4 w-4" /> Close
        </Button>
      </section>
    );
  }

  if (!detail) return null;

  if (done) {
    return (
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-soft text-success">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Appointment rescheduled</h2>
            <p className="text-sm text-muted-foreground">
              New session: {selectedSession ? formatSlot(selectedSession.startAt) : "—"}
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() =>
            onDone(
              selectedSession
                ? {
                    startAt: selectedSession.startAt,
                    city: selectedSession.city,
                    centerName: selectedSession.centerName,
                  }
                : null,
            )
          }
        >
          Done
        </Button>
      </section>
    );
  }

  if (!detail.canBeRescheduled) {
    return (
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-bold">Reschedule appointment</h2>
        <p className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          SVP does not allow rescheduling this reservation. Use the official portal if the
          appointment needs to change.
        </p>
        <Button type="button" variant="outline" onClick={onCancel}>
          Close
        </Button>
      </section>
    );
  }

  const cityOptions = isTargeted
    ? [
        ...new Set(
          dates.map((entry) => entry.city).filter((entry): entry is string => Boolean(entry)),
        ),
      ]
    : [
        ...new Set([
          ...takamolCities,
          ...(detail?.city ? [detail.city] : []),
          ...(city ? [city] : []),
        ]),
      ].sort((a, b) => a.localeCompare(b));
  const shownDateOptions: Array<{ date: string; city: string | null }> = isTargeted
    ? dateOptions.map((entry) => ({
        date: splitDateTime(entry.startAt).date,
        city: entry.city,
      }))
    : siteDateOptions;
  const activeDateValue = isTargeted
    ? selectedDate
      ? splitDateTime(selectedDate.startAt).date
      : ""
    : (prometricDate ?? "");
  const datesLoading = isTargeted ? datesQuery.isFetching : sitesQuery.isFetching;
  const datesError = isTargeted
    ? datesQuery.data && !datesQuery.data.ok
      ? datesQuery.data.message
      : datesQuery.isError
        ? "Reschedule dates could not be loaded. Try again."
        : null
    : sitesQuery.data && !sitesQuery.data.ok
      ? sitesQuery.data.message
      : sitesQuery.isError
        ? "Test center dates could not be loaded. Try again."
        : null;
  const datesLoaded = isTargeted ? Boolean(datesQuery.data?.ok) : Boolean(sitesQuery.data?.ok);
  const sessionViews = isTargeted
    ? sessions.map((entry) => ({
        key: `s-${entry.id}`,
        startAt: entry.startAt,
        center: entry.centerName ?? entry.city ?? city,
        seats: entry.availableSeats,
        duration: entry.duration,
        selected: selectedSession?.id === entry.id && !selectedSlot,
        onSelect: () => {
          setSelectedSession(entry);
          setSelectedSlot(null);
        },
      }))
    : prometricSlots.map((slot) => {
        const site = prometricSites.find((entry) => entry.siteId === slot.siteId) ?? null;
        const takamolMatch = takamolSlotMappings.find((entry) => entry.slot?.id === slot.id);
        return {
          key: `p-${slot.id}`,
          startAt: slot.startAt,
          center: site?.name ?? site?.city ?? city,
          seats: takamolMatch?.row.seats ?? null,
          duration: slot.duration,
          selected: selectedSlot?.id === slot.id,
          onSelect: () => chooseSlot(slot),
        };
      });
  const sessionsLoading = isTargeted ? sessionsQuery.isFetching : slotsQuery.isFetching;
  const sessionsError = isTargeted
    ? sessionsQuery.data && !sessionsQuery.data.ok
      ? sessionsQuery.data.message
      : sessionsQuery.isError
        ? "Sessions could not be loaded. Try again."
        : null
    : slotsQuery.data && !slotsQuery.data.ok
      ? slotsQuery.data.message
      : slotsQuery.isError
        ? "Available test-center slots could not be loaded. Try again."
        : null;
  const sessionsLoaded = isTargeted
    ? Boolean(sessionsQuery.data?.ok)
    : Boolean(slotsQuery.data?.ok);
  const siteMappingNeedsSignIn = Boolean(
    (sitesQuery.data && !sitesQuery.data.ok && sitesQuery.data.needsSignIn) ||
    (slotsQuery.data && !slotsQuery.data.ok && slotsQuery.data.needsSignIn),
  );

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Reschedule appointment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.occupationName ?? "Occupation"} · #{detail.id}
            {detail.city || detail.centerName ? ` · ${detail.centerName ?? detail.city}` : ""}
            {` · ${isTargeted ? "targeted" : "site-based"} flow`}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" /> Current session:{" "}
            {detail.startAt ? formatSlot(detail.startAt) : "—"}
            {rescheduleTimes !== null ? ` · ${rescheduleTimes} reschedule(s) left` : ""}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1 h-4 w-4" /> Cancel
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New city *">
          <NativeSelect
            value={manualCityMode ? MANUAL_CITY_OPTION : city}
            onChange={(event) => selectCity(event.target.value)}
            disabled={isTargeted ? datesQuery.isFetching : citiesQuery.isFetching}
            required
          >
            <option value="">Select a city</option>
            {cityOptions.map((entry) => (
              <option key={entry} value={entry}>
                {cityFallbackOnly && entry === detail.city
                  ? `${entry} (current booking fallback)`
                  : entry}
              </option>
            ))}
            {!isTargeted && (
              <option value={MANUAL_CITY_OPTION}>Enter another city manually…</option>
            )}
          </NativeSelect>
        </Field>
        <Field label="Exam language">
          <NativeSelect
            value={activeLanguage}
            onChange={(event) => {
              setLanguageCode(event.target.value);
              resetSelection();
            }}
          >
            {(languageOptions.length > 0
              ? languageOptions
              : [{ code: "en", label: "English", questionCount: null, nonTargeted: false }]
            ).map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {!isTargeted && (
          <Field label="Month to check">
            <NativeSelect
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setPrometricDate(null);
                setSelectedSlot(null);
                setSelectedSession(null);
              }}
            >
              {monthOptions.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>

      {!isTargeted && manualCityMode && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Manual city name">
            <Input
              value={manualCityName}
              onChange={(event) => setManualCityName(event.target.value)}
              placeholder="Enter a city name recognized by Takamol"
              autoComplete="address-level2"
              maxLength={100}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            onClick={applyManualCity}
            disabled={!manualCityName.trim()}
          >
            Check this city
          </Button>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            The city name will be checked with Takamol for cities, centers, dates, and sessions. A
            slot can be selected only when its availability row matches one unique SVP slot ID.
          </p>
        </div>
      )}

      {!isTargeted && detail && citiesQuery.isFetching && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading cities from Takamol…
        </p>
      )}
      {!isTargeted && detail && !citiesQuery.isFetching && cityListError && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-3">
          <p className="text-sm text-destructive">
            Could not load cities from Takamol: {cityListError}
          </p>
          {cityFallbackOnly && (
            <p className="text-sm text-muted-foreground">
              The current booking city, {detail.city}, is available as a fallback option. Select it
              manually if you want to check it; it will not be selected automatically. To try
              another city, choose “Enter another city manually”; Takamol must recognize that city
              and return availability.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void citiesQuery.refetch()}
          >
            Retry city list
          </Button>
        </div>
      )}
      {!isTargeted && detail && !citiesQuery.isFetching && cityListEmpty && (
        <div
          role="status"
          className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground"
        >
          Takamol returned no cities for this category. The current booking city
          {detail.city ? ` (${detail.city})` : ""} is available as a fallback option. Select it
          manually if you want to check it. To try another city, choose “Enter another city
          manually”; Takamol must recognize the city and return availability.
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void citiesQuery.refetch()}
            >
              Retry city list
            </Button>
          </div>
        </div>
      )}

      {!isTargeted && city && centersQuery.isFetching && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading test centers from Takamol…
        </p>
      )}
      {!isTargeted &&
        city &&
        ((centersQuery.data && !centersQuery.data.success) || centersQuery.isError) && (
          <p role="status" className="text-xs text-amber-800">
            Takamol centers could not be loaded: {centersErrorMessage ?? "request failed"}.
            Availability rows will only be selectable when their center can be matched exactly to an
            SVP site.
          </p>
        )}
      {!isTargeted && city && centersQuery.data?.success && takamolCenters.length === 0 && (
        <p role="status" className="text-xs text-muted-foreground">
          Takamol returned no center catalogue entries for this city; only availability rows with a
          center identity that matches an SVP site can be selected.
        </p>
      )}

      {isTargeted && effectiveCategoryId == null && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          This reservation has no SVP category, so reschedule dates cannot be loaded. Use the
          official SVP portal for this booking.
        </p>
      )}

      {!isTargeted && !city && (
        <p className="text-sm text-muted-foreground">Select a city to load the reschedule dates.</p>
      )}

      {datesLoading &&
        !datesError &&
        (isTargeted ? effectiveCategoryId != null : Boolean(city)) && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Loading reschedule dates…
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
            ? "No reschedule dates are available. Choose another city or use the official portal."
            : `No SVP test-center dates are available in ${selectedMonthLabel} for this city.`}
        </p>
      )}

      {shownDateOptions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">New date</p>
          <div className="flex flex-wrap gap-2">
            {shownDateOptions.map((entry) => {
              const active = activeDateValue === entry.date;
              return (
                <Button
                  key={`${entry.date}-${entry.city ?? ""}`}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => selectDateOption(entry)}
                >
                  <CalendarDays className="mr-1 h-3.5 w-3.5" /> {formatDate(entry.date)}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {activeDateValue && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{isTargeted ? "New session" : "New slot"}</p>
          {sessionsLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Loading sessions…
            </p>
          )}
          {sessionsError && (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-destructive">{sessionsError}</p>
              {siteMappingNeedsSignIn && onReconnect && (
                <Button type="button" variant="outline" size="sm" onClick={onReconnect}>
                  Reconnect to SVP
                </Button>
              )}
            </div>
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
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => rescheduleMutation.mutate()}
          disabled={!selectedSession || rescheduleMutation.isPending}
        >
          {rescheduleMutation.isPending ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          Confirm reschedule
        </Button>
      </div>
    </section>
  );
}
