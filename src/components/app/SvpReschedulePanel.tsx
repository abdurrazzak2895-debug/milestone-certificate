import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Field, NativeSelect } from "@/components/app/ui-bits";
import {
  getSvpReservationDetail,
  listSvpExamSessions,
  listSvpPrometricSites,
  listSvpPrometricSlots,
  listSvpRescheduleDates,
  listSvpTestCenterCities,
  rescheduleSvpBooking,
  rescheduleSvpSiteBooking,
} from "@/lib/svp-booking.functions";
import type { SvpAvailableDate, SvpExamSession, SvpPrometricSlot } from "@/lib/svp-api.shared";

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

export function SvpReschedulePanel({
  reservationId,
  rescheduleTimes,
  countryId,
  isTargeted = true,
  onCancel,
  onDone,
}: {
  reservationId: string;
  rescheduleTimes: number | null;
  countryId?: number | null;
  isTargeted?: boolean;
  onCancel: () => void;
  onDone: (
    result: { startAt: string; city: string | null; centerName: string | null } | null,
  ) => void;
}) {
  const queryClient = useQueryClient();
  const [city, setCity] = useState("");
  const [languageCode, setLanguageCode] = useState("");
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

  const datesQuery = useQuery({
    queryKey: ["svp-reschedule-dates", reservationId, detail?.categoryId, effectiveCountryId],
    queryFn: () =>
      listSvpRescheduleDates({
        data: {
          reservationId,
          categoryId: detail?.categoryId as number,
          countryId: effectiveCountryId,
        },
      }),
    enabled: isTargeted && Boolean(detail?.categoryId),
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
    queryKey: ["svp-cities"],
    queryFn: () => listSvpTestCenterCities(),
    enabled: !isTargeted,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const prometricCities = useMemo(
    () => (citiesQuery.data?.ok ? citiesQuery.data.data : []),
    [citiesQuery.data],
  );

  const sitesQuery = useQuery({
    queryKey: ["svp-reschedule-sites", activeLanguage, city, effectiveCountryId],
    queryFn: () =>
      listSvpPrometricSites({
        data: { prometricCode: activeLanguage, city, countryId: effectiveCountryId },
      }),
    enabled: !isTargeted && Boolean(city),
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
  const prometricSlots = slotsQuery.data?.ok ? slotsQuery.data.data : [];

  const sessionDate = selectedDate ? splitDateTime(selectedDate.startAt).date : "";
  const sessionCity = selectedDate?.city ?? city;
  const sessionsQuery = useQuery({
    queryKey: ["svp-reschedule-sessions", detail?.categoryId, sessionCity, sessionDate],
    queryFn: () =>
      listSvpExamSessions({
        data: {
          categoryId: detail?.categoryId as number,
          city: sessionCity,
          examDate: sessionDate,
        },
      }),
    enabled:
      isTargeted && Boolean(detail?.categoryId) && Boolean(sessionCity) && Boolean(sessionDate),
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
          categoryId: detail?.categoryId as number,
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
  };

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
    : prometricCities.map((entry) => entry.city);
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
  const datesLoading = isTargeted ? datesQuery.isPending : sitesQuery.isPending;
  const datesError = isTargeted
    ? datesQuery.data && !datesQuery.data.ok
      ? datesQuery.data.message
      : null
    : sitesQuery.data && !sitesQuery.data.ok
      ? sitesQuery.data.message
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
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              resetSelection();
            }}
            disabled={isTargeted ? datesQuery.isPending : citiesQuery.isPending}
            required
          >
            <option value="">Select a city</option>
            {cityOptions.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
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
      </div>

      {datesLoading && (
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
            : "No test center sites have free dates this month for this city."}
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
