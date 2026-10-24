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
  listSvpRescheduleDates,
  rescheduleSvpBooking,
} from "@/lib/svp-booking.functions";
import type { SvpAvailableDate, SvpExamSession } from "@/lib/svp-api.shared";

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
  const [done, setDone] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["svp-reservation-detail", reservationId],
    queryFn: () => getSvpReservationDetail({ data: { reservationId } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const detail = detailQuery.data?.ok ? detailQuery.data.data : null;
  const activeLanguage = languageCode || detail?.languages[0]?.code || "en";

  const datesQuery = useQuery({
    queryKey: [
      "svp-reschedule-dates",
      reservationId,
      detail?.categoryId,
      detail?.countryId ?? countryId ?? null,
    ],
    queryFn: () =>
      listSvpRescheduleDates({
        data: {
          reservationId,
          categoryId: detail?.categoryId as number,
          countryId: detail?.countryId ?? countryId ?? null,
        },
      }),
    enabled: Boolean(detail?.categoryId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const dates = useMemo(() => (datesQuery.data?.ok ? datesQuery.data.data : []), [datesQuery.data]);
  const cityOptions = useMemo(
    () => [
      ...new Set(
        dates.map((entry) => entry.city).filter((entry): entry is string => Boolean(entry)),
      ),
    ],
    [dates],
  );
  const dateOptions = useMemo(() => {
    const map = new Map<string, SvpAvailableDate>();
    for (const entry of dates) {
      if (city && entry.city !== city) continue;
      const { date } = splitDateTime(entry.startAt);
      if (date && !map.has(date)) map.set(date, entry);
    }
    return [...map.values()];
  }, [city, dates]);

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
    enabled: Boolean(detail?.categoryId) && Boolean(sessionCity) && Boolean(sessionDate),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const sessions = sessionsQuery.data?.ok ? sessionsQuery.data.data : [];

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSession) throw new Error("Choose a new session first.");
      const response = await rescheduleSvpBooking({
        data: {
          reservationId,
          examSessionId: selectedSession.id,
          languageCode: activeLanguage,
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

  if (!isTargeted) {
    return (
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-bold">Reschedule appointment</h2>
        <p className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          This account uses SVP&apos;s site-based flow. Site-based rescheduling must be completed in
          the official SVP portal.
        </p>
        <Button type="button" variant="outline" onClick={onCancel}>
          Close
        </Button>
      </section>
    );
  }

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

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Reschedule appointment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.occupationName ?? "Occupation"} · #{detail.id}
            {detail.city || detail.centerName ? ` · ${detail.centerName ?? detail.city}` : ""}
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
              setSelectedDate(null);
              setSelectedSession(null);
            }}
            disabled={datesQuery.isPending}
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
            onChange={(event) => setLanguageCode(event.target.value)}
          >
            {(detail.languages.length > 0
              ? detail.languages
              : [{ code: "en", label: "English", questionCount: null }]
            ).map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {datesQuery.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading reschedule dates…
        </p>
      )}
      {datesQuery.data && !datesQuery.data.ok && (
        <p role="alert" className="text-sm text-destructive">
          {datesQuery.data.message}
        </p>
      )}
      {!datesQuery.isPending && datesQuery.data?.ok && dateOptions.length === 0 && (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          No reschedule dates are available. Choose another city or use the official portal.
        </p>
      )}

      {dateOptions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">New date</p>
          <div className="flex flex-wrap gap-2">
            {dateOptions.map((entry) => {
              const { date } = splitDateTime(entry.startAt);
              const active = selectedDate
                ? splitDateTime(selectedDate.startAt).date === date
                : false;
              return (
                <Button
                  key={`${date}-${entry.city ?? ""}`}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => {
                    setSelectedDate(entry);
                    setSelectedSession(null);
                    if (entry.city) setCity(entry.city);
                  }}
                >
                  <CalendarDays className="mr-1 h-3.5 w-3.5" /> {formatDate(date)}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {selectedDate && (
        <div className="space-y-2">
          <p className="text-sm font-medium">New session</p>
          {sessionsQuery.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Loading sessions…
            </p>
          )}
          {sessionsQuery.data && !sessionsQuery.data.ok && (
            <p role="alert" className="text-sm text-destructive">
              {sessionsQuery.data.message}
            </p>
          )}
          {sessionsQuery.data?.ok && sessions.length === 0 && (
            <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              No sessions with free seats on this date.
            </p>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            {sessions.map((entry) => {
              const active = selectedSession?.id === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedSession(entry)}
                  className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                    active ? "border-primary bg-primary-soft" : "bg-card hover:border-primary/50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{formatSlot(entry.startAt)}</span>
                    {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {entry.centerName ?? entry.city ?? city}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Seats: {entry.availableSeats ?? "—"} · Duration: {entry.duration || "—"}s
                  </span>
                </button>
              );
            })}
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
