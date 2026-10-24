import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { lookupTakamolAvailability } from "@/lib/takamol-availability.functions";
import type { TakamolLookupRequest } from "@/lib/takamol-availability.shared";
import {
  parseAvailableDates,
  parseCities,
  parseOccupations,
  parseSessions,
  parseTestCenters,
  redactTakamolPayload,
  type OccupationChoice,
} from "@/lib/takamol-availability.ui";

const SESSION_REQUEST = "sessions" as const;
type SessionRequest = Extract<TakamolLookupRequest, { endpoint: typeof SESSION_REQUEST }>;

async function getLookupData(request: TakamolLookupRequest): Promise<unknown> {
  const result = await lookupTakamolAvailability({ data: request });
  if (!result.success) throw new Error(result.message);
  return result.data;
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The lookup could not be completed. Check access and server configuration.";
}

function formatAvailableDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function StepHeading({
  number,
  title,
  detail,
  icon: Icon,
  complete = false,
}: {
  number: number;
  title: string;
  detail: string;
  icon: typeof Search;
  complete?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
          complete
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/60 text-muted-foreground"
        }`}
      >
        {complete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Step {number}
          </span>
          {complete && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </div>
        <h3 className="font-semibold leading-tight">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function InlineState({ children, error = false }: { children: string; error?: boolean }) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
        error
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border/70 bg-muted/40 text-muted-foreground"
      }`}
    >
      {error ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
      )}
      <span>{children}</span>
    </div>
  );
}

export function TakamolAvailabilityPanel() {
  const [occupationSearch, setOccupationSearch] = useState("");
  const [selectedOccupation, setSelectedOccupation] = useState<OccupationChoice | null>(null);
  const [city, setCity] = useState("");
  const [examDate, setExamDate] = useState("");
  const [testCenterId, setTestCenterId] = useState("all");

  const occupationSearchMutation = useMutation({
    mutationFn: (search: string) =>
      getLookupData({ endpoint: "occupations", search: search.trim() || undefined }),
  });

  const categoryId = selectedOccupation?.categoryId ?? "";
  const citiesQuery = useQuery({
    queryKey: ["takamol", "cities", categoryId],
    queryFn: () => getLookupData({ endpoint: "cities", categoryId }),
    enabled: Boolean(categoryId),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const datesQuery = useQuery({
    queryKey: ["takamol", "dates", categoryId, city],
    queryFn: () => getLookupData({ endpoint: "dates", categoryId, city }),
    enabled: Boolean(categoryId && city),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const centersQuery = useQuery({
    queryKey: ["takamol", "centers", city],
    queryFn: () => getLookupData({ endpoint: "centers", city }),
    enabled: Boolean(city),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const sessionsMutation = useMutation({
    mutationFn: (request: SessionRequest) => getLookupData(request),
  });

  const occupations = parseOccupations(occupationSearchMutation.data);
  const cities = parseCities(citiesQuery.data);
  const dates = parseAvailableDates(datesQuery.data);
  const centers = parseTestCenters(centersQuery.data);
  const sessions = parseSessions(sessionsMutation.data);

  const searchOccupations = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelectedOccupation(null);
    setCity("");
    setExamDate("");
    setTestCenterId("all");
    sessionsMutation.reset();
    occupationSearchMutation.reset();
    occupationSearchMutation.mutate(occupationSearch);
  };

  const selectOccupation = (optionId: string) => {
    const next = occupations.find((option) => option.optionId === optionId);
    if (!next) return;
    setSelectedOccupation(next);
    setCity("");
    setExamDate("");
    setTestCenterId("all");
    sessionsMutation.reset();
  };

  const selectCity = (value: string) => {
    setCity(value);
    setExamDate("");
    setTestCenterId("all");
    sessionsMutation.reset();
  };

  const searchSessions = () => {
    if (!selectedOccupation || !city || !examDate) return;
    sessionsMutation.reset();
    sessionsMutation.mutate({
      endpoint: "sessions",
      categoryId: selectedOccupation.categoryId,
      city,
      examDate,
      testCenterId: testCenterId === "all" ? undefined : testCenterId,
    });
  };

  const clearSearch = () => {
    setOccupationSearch("");
    setSelectedOccupation(null);
    setCity("");
    setExamDate("");
    setTestCenterId("all");
    occupationSearchMutation.reset();
    sessionsMutation.reset();
  };

  const centerLabel = centers.find((center) => center.id === testCenterId)?.label;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-teal-900/20 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-5 text-white shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-200/20 bg-teal-300/10 px-3 py-1 text-xs font-medium text-teal-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Read-only availability
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Find an exam session</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Search by occupation, then choose a city, available date, and test center. The choices
              update as you move through the flow.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
            <ShieldCheck className="h-4 w-4 text-teal-200" />
            No booking or payment actions
          </div>
        </div>
        <div className="relative mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Occupation", value: selectedOccupation?.label, icon: BriefcaseBusiness },
            { title: "City", value: city, icon: MapPin },
            { title: "Available date", value: examDate, icon: CalendarDays },
            {
              title: "Test center",
              value: centerLabel ?? (testCenterId === "all" ? "Any center" : null),
              icon: Building2,
            },
          ].map((step, index) => {
            const Icon = step.icon;
            const done = Boolean(step.value) && !(index === 3 && testCenterId === "all");
            return (
              <div
                key={step.title}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    done ? "bg-teal-300/15 text-teal-100" : "bg-white/5 text-slate-400"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-[0.15em] text-slate-400">
                    0{index + 1} · {step.title}
                  </span>
                  <span className="block truncate text-sm font-medium text-slate-100">
                    {step.value || "Choose to continue"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          <section className="card-surface space-y-4 p-4 sm:p-5">
            <StepHeading
              number={1}
              title="Choose an occupation"
              detail="Search the occupation catalogue to load the matching cities."
              icon={BriefcaseBusiness}
              complete={Boolean(selectedOccupation)}
            />
            <form
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
              onSubmit={searchOccupations}
            >
              <Field label="Search occupation">
                <Input
                  value={occupationSearch}
                  onChange={(event) => setOccupationSearch(event.target.value)}
                  maxLength={120}
                  placeholder="e.g. Barber, Electrician"
                />
              </Field>
              <div className="self-end">
                <Button type="submit" disabled={occupationSearchMutation.isPending}>
                  {occupationSearchMutation.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Search />
                  )}
                  Search occupations
                </Button>
              </div>
            </form>
            {occupationSearchMutation.isError && (
              <InlineState error>{errorText(occupationSearchMutation.error)}</InlineState>
            )}
            {occupationSearchMutation.isSuccess && occupations.length === 0 && (
              <InlineState>
                No matching occupations were returned. Try a broader search.
              </InlineState>
            )}
            {occupations.length > 0 && (
              <Field label="Occupation result">
                <Select value={selectedOccupation?.optionId ?? ""} onValueChange={selectOccupation}>
                  <SelectTrigger aria-label="Select an occupation">
                    <SelectValue placeholder={`Choose from ${occupations.length} results`} />
                  </SelectTrigger>
                  <SelectContent>
                    {occupations.map((occupation) => (
                      <SelectItem key={occupation.optionId} value={occupation.optionId}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{occupation.label}</span>
                          {occupation.category && (
                            <span className="truncate text-xs text-muted-foreground">
                              · {occupation.category}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedOccupation && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Category ID {selectedOccupation.categoryId}
                  </span>
                )}
              </Field>
            )}
          </section>

          <section className="card-surface space-y-4 p-4 sm:p-5">
            <StepHeading
              number={2}
              title="Select a city"
              detail="Cities load automatically for the selected occupation."
              icon={MapPin}
              complete={Boolean(city)}
            />
            {!selectedOccupation ? (
              <InlineState>Choose an occupation first to load available cities.</InlineState>
            ) : citiesQuery.isPending ? (
              <InlineState>Loading cities for {selectedOccupation.label}…</InlineState>
            ) : citiesQuery.isError ? (
              <InlineState error>{errorText(citiesQuery.error)}</InlineState>
            ) : cities.length > 0 ? (
              <Field label="City">
                <Select value={city} onValueChange={selectCity}>
                  <SelectTrigger aria-label="Select a city">
                    <SelectValue placeholder="Choose a city" />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <InlineState>No cities were returned for this occupation.</InlineState>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card-surface space-y-4 p-4 sm:p-5">
              <StepHeading
                number={3}
                title="Choose an available date"
                detail="Only dates returned by the availability service are selectable."
                icon={CalendarDays}
                complete={Boolean(examDate)}
              />
              {!city ? (
                <InlineState>Select a city to load available dates.</InlineState>
              ) : datesQuery.isPending ? (
                <InlineState>Checking dates for {city}…</InlineState>
              ) : datesQuery.isError ? (
                <InlineState error>{errorText(datesQuery.error)}</InlineState>
              ) : dates.length > 0 ? (
                <Field label="Available exam date">
                  <Select
                    value={examDate}
                    onValueChange={(value) => {
                      setExamDate(value);
                      sessionsMutation.reset();
                    }}
                  >
                    <SelectTrigger aria-label="Select an available exam date">
                      <SelectValue placeholder="Choose an available date" />
                    </SelectTrigger>
                    <SelectContent>
                      {dates.map((date) => (
                        <SelectItem key={date} value={date}>
                          {formatAvailableDate(date)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <InlineState>No available dates were returned for this city.</InlineState>
              )}
            </section>

            <section className="card-surface space-y-4 p-4 sm:p-5">
              <StepHeading
                number={4}
                title="Choose a test center"
                detail="Choose a center or search all centers in the selected city."
                icon={Building2}
                complete={testCenterId !== "all"}
              />
              {!city ? (
                <InlineState>Select a city to load its test centers.</InlineState>
              ) : centersQuery.isPending ? (
                <InlineState>Loading test centers for {city}…</InlineState>
              ) : centersQuery.isError ? (
                <InlineState error>{errorText(centersQuery.error)}</InlineState>
              ) : (
                <Field label="Test center">
                  <Select
                    value={testCenterId}
                    onValueChange={(value) => {
                      setTestCenterId(value);
                      sessionsMutation.reset();
                    }}
                  >
                    <SelectTrigger aria-label="Select a test center">
                      <SelectValue placeholder="All available centers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All available centers</SelectItem>
                      {centers.map((center) => (
                        <SelectItem key={center.id} value={center.id}>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{center.label}</span>
                            {center.location && (
                              <span className="truncate text-xs text-muted-foreground">
                                · {center.location}
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {centers.length === 0 && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      No center list was returned; you can still search all centers for this city.
                    </span>
                  )}
                </Field>
              )}
            </section>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="lg"
              disabled={!selectedOccupation || !city || !examDate || sessionsMutation.isPending}
              onClick={searchSessions}
              className="min-w-48"
            >
              {sessionsMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ArrowRight />
              )}
              Find exam sessions
            </Button>
            <Button type="button" variant="ghost" onClick={clearSearch}>
              Start over
            </Button>
          </div>

          {sessionsMutation.isError && (
            <InlineState error>{errorText(sessionsMutation.error)}</InlineState>
          )}
          {sessionsMutation.isSuccess && (
            <section className="card-surface space-y-4 p-4 sm:p-5" aria-live="polite">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Availability result
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">Exam sessions</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedOccupation?.label} · {city} · {examDate}
                    {centerLabel ? ` · ${centerLabel}` : " · all centers"}
                  </p>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                  {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
                </span>
              </div>
              {sessions.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {sessions.map((session, index) => (
                    <article
                      key={`${String(session["id"] ?? session["session_id"] ?? index)}`}
                      className="rounded-xl border border-border/70 bg-background/60 p-4"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Clock3 className="h-4 w-4" />
                        </span>
                        <div>
                          <h4 className="font-semibold">
                            {String(
                              session["session_name"] ??
                                session["name"] ??
                                session["title"] ??
                                session["time"] ??
                                `Session ${index + 1}`,
                            )}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {String(session["exam_time"] ?? session["start_time"] ?? "Available")}
                          </p>
                        </div>
                      </div>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed">
                        {JSON.stringify(redactTakamolPayload(session), null, 2)}
                      </pre>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
                  <Clock3 className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-2 font-medium">No sessions found for this selection</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try another available date or search all centers in {city}.
                  </p>
                </div>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  Show sanitized response details
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3">
                  {JSON.stringify(redactTakamolPayload(sessionsMutation.data), null, 2)}
                </pre>
              </details>
            </section>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="card-surface space-y-4 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Search summary
                </p>
                <h3 className="font-semibold">Your selection</h3>
              </div>
            </div>
            <dl className="space-y-3">
              <SummaryRow label="Occupation" value={selectedOccupation?.label} />
              <SummaryRow label="City" value={city} />
              <SummaryRow
                label="Date"
                value={examDate ? formatAvailableDate(examDate) : undefined}
              />
              <SummaryRow label="Test center" value={centerLabel ?? "All centers"} />
            </dl>
            <div className="rounded-lg border border-teal-900/10 bg-teal-500/5 p-3 text-xs leading-relaxed text-muted-foreground">
              This tool only checks availability. It does not reserve seats or change an exam
              booking.
            </div>
          </section>
          <section className="rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Secure server-side request
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Your Takamol key stays on the server. Only validated read-only GET lookups are sent to
              the availability gateway.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] truncate text-right text-sm font-medium">
        {value || <span className="font-normal text-muted-foreground">Not selected</span>}
      </dd>
    </div>
  );
}
