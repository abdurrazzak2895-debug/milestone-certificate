import { Check, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SvpExamSessionView = {
  key: string;
  startAt: string;
  endAt?: string | null;
  center: string | null;
  city: string | null;
  seats: number | null;
  duration: number | null;
  durationUnit: "seconds" | "minutes";
  selected: boolean;
  onSelect: () => void;
};

type Props = {
  views: SvpExamSessionView[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  targeted: boolean;
  loadBalancer: boolean;
  onRetry: () => void;
};

const UNAVAILABLE = "Not provided by SVP";

/** Preserve the provider's wall-clock time; date-only tokens must never imply midnight. */
function sessionDateTime(value: string): { date: string; time: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]([01]\d|2[0-3]):([0-5]\d))?(?:$|[:.Z+ -])/.exec(
    value.trim(),
  );
  if (!match) return { date: UNAVAILABLE, time: UNAVAILABLE };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { date: UNAVAILABLE, time: UNAVAILABLE };
  }
  return {
    date: parsed.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
    time: match[4] && match[5] ? `${match[4]}:${match[5]}` : UNAVAILABLE,
  };
}

function durationText(duration: number | null, unit: SvpExamSessionView["durationUnit"]): string {
  if (duration === null || !Number.isFinite(duration) || duration <= 0) return UNAVAILABLE;
  if (unit === "minutes") return `${duration} min`;
  return duration % 60 === 0 ? `${duration / 60} min` : `${duration} s`;
}

export function SvpExamSessionsTable({
  views,
  loading,
  error,
  loaded,
  targeted,
  loadBalancer,
  onRetry,
}: Props) {
  const title = targeted ? "Exam sessions" : "Available slots";
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">
            All returned sessions for the selected city and date load automatically. Select one
            below; selecting alone does not hold a seat.
          </p>
        </div>
        {!loading && !error && loaded && views.length > 0 && (
          <span className="rounded-full border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
            {views.length} {views.length === 1 ? "option" : "options"}
          </span>
        )}
      </div>

      {loading ? (
        <p
          className="flex items-center gap-2 rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading session details…
        </p>
      ) : error ? (
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry sessions
          </Button>
        </div>
      ) : !loaded ? (
        <p role="status" className="text-sm text-muted-foreground">
          Waiting for session details…
        </p>
      ) : views.length === 0 ? (
        <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          {targeted
            ? "No sessions with free seats on this date."
            : "No slots with free seats on this date."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card/70">
            <table className="w-full min-w-[820px] text-left text-sm">
              <caption className="sr-only">{title} for the selected city and date</caption>
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Test center",
                    "City",
                    "Exam date",
                    "Exam time",
                    "Seats",
                    "Duration",
                    "Selection",
                  ].map((label) => (
                    <th key={label} scope="col" className="px-4 py-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {views.map((view, index) => {
                  const start = sessionDateTime(view.startAt);
                  const end = view.endAt ? sessionDateTime(view.endAt) : null;
                  const time =
                    start.time === UNAVAILABLE
                      ? UNAVAILABLE
                      : end && end.time !== UNAVAILABLE
                        ? `${start.time} – ${end.time}${end.date !== start.date ? ` (${end.date})` : ""}`
                        : start.time;
                  const center =
                    view.center?.trim() ||
                    (targeted && loadBalancer ? "Assigned by SVP after seat hold" : UNAVAILABLE);
                  const city = view.city?.trim() || UNAVAILABLE;
                  const seats =
                    view.seats !== null && Number.isFinite(view.seats) && view.seats >= 0
                      ? view.seats
                      : null;
                  return (
                    <tr
                      key={view.key}
                      className={view.selected ? "bg-primary-soft" : "hover:bg-muted/20"}
                    >
                      <td className="max-w-[240px] px-4 py-4 font-medium">{center}</td>
                      <td className="px-4 py-4 text-muted-foreground">{city}</td>
                      <td className="whitespace-nowrap px-4 py-4">{start.date}</td>
                      <td className="whitespace-nowrap px-4 py-4">{time}</td>
                      <td className="px-4 py-4">
                        {seats === null ? (
                          <span className="text-xs text-muted-foreground">{UNAVAILABLE}</span>
                        ) : (
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${seats > 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
                          >
                            {seats}
                            {seats === 0 ? " · Full" : " available"}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                        {durationText(view.duration, view.durationUnit)}
                      </td>
                      <td className="px-4 py-4">
                        <Button
                          type="button"
                          size="sm"
                          variant={view.selected ? "default" : "outline"}
                          aria-pressed={view.selected}
                          aria-label={`${view.selected ? "Selected" : "Select"} ${view.center?.trim() || view.city?.trim() || "SVP session"} · ${start.date} · ${start.time} · session ${index + 1}`}
                          disabled={seats === 0}
                          onClick={view.onSelect}
                        >
                          {view.selected && <Check className="mr-1 h-3.5 w-3.5" />}
                          {seats === 0 ? "Full" : view.selected ? "Selected" : "Select"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Seat counts, times and durations are shown only when SVP supplies them. A city is not a
            test-center name.{" "}
            {targeted &&
              loadBalancer &&
              "For date-only assignment tokens, SVP reveals the assigned center/session after a seat hold; this table does not create a hold to discover it."}
          </p>
        </>
      )}
    </section>
  );
}
