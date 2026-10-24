import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui-bits";
import { lookupTakamolAvailability } from "@/lib/takamol-availability.functions";
import type { TakamolLookupRequest, TakamolLookupResult } from "@/lib/takamol-availability.shared";

const endpointLabels: Record<TakamolLookupRequest["endpoint"], string> = {
  occupations: "Occupations",
  cities: "Cities",
  dates: "Available dates",
  centers: "Test centers",
  sessions: "Exam sessions",
};

export function TakamolAvailabilityPanel() {
  const [occupationSearch, setOccupationSearch] = useState("");
  const [cityCategoryId, setCityCategoryId] = useState("");
  const [dateCategoryId, setDateCategoryId] = useState("");
  const [dateCity, setDateCity] = useState("");
  const [centerCity, setCenterCity] = useState("");
  const [sessionCategoryId, setSessionCategoryId] = useState("");
  const [sessionCity, setSessionCity] = useState("");
  const [examDate, setExamDate] = useState("");
  const [testCenterId, setTestCenterId] = useState("");
  const [activeEndpoint, setActiveEndpoint] = useState<TakamolLookupRequest["endpoint"] | null>(
    null,
  );
  const lookup = useMutation({
    mutationFn: (request: TakamolLookupRequest) => lookupTakamolAvailability({ data: request }),
  });

  const runLookup = (request: TakamolLookupRequest) => {
    setActiveEndpoint(request.endpoint);
    lookup.reset();
    lookup.mutate(request);
  };

  const result = lookup.data as TakamolLookupResult | undefined;

  return (
    <div className="max-w-5xl space-y-4">
      <section className="card-surface space-y-2 p-4">
        <h2 className="text-lg font-semibold">Takamol Availability API</h2>
        <p className="text-sm text-muted-foreground">
          এই সংযোগটি কেবল read-only availability lookup করে। API key সার্ভারের
          <code className="mx-1 rounded bg-muted px-1">TAKAMOL_API_KEY</code>
          environment variable-এ রাখতে হবে; এটি এই পেজ বা browser-এ দেখানো হয় না।
        </p>
        <p className="text-xs text-muted-foreground">
          এখানে login, session refresh, booking, reservation, seat hold, OTP, payment, cancellation
          বা rescheduling করা হয় না।
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-surface space-y-3 p-4">
          <div>
            <h3 className="font-medium">Occupations</h3>
            <p className="text-xs text-muted-foreground">
              GET /api/external/takamol-availability/v1/occupations
            </p>
          </div>
          <Field label="Search (optional)">
            <Input
              value={occupationSearch}
              onChange={(event) => setOccupationSearch(event.target.value)}
              maxLength={120}
              placeholder="Occupation name"
            />
          </Field>
          <Button
            type="button"
            disabled={lookup.isPending}
            onClick={() => runLookup({ endpoint: "occupations", search: occupationSearch.trim() })}
          >
            Occupation catalogue দেখুন
          </Button>
        </section>

        <section className="card-surface space-y-3 p-4">
          <div>
            <h3 className="font-medium">Cities</h3>
            <p className="text-xs text-muted-foreground">
              GET /api/external/takamol-availability/v1/cities
            </p>
          </div>
          <Field label="Category ID">
            <Input
              value={cityCategoryId}
              onChange={(event) => setCityCategoryId(event.target.value)}
              maxLength={80}
              placeholder="যেমন: 50"
            />
          </Field>
          <Button
            type="button"
            disabled={lookup.isPending || !cityCategoryId.trim()}
            onClick={() => runLookup({ endpoint: "cities", categoryId: cityCategoryId.trim() })}
          >
            City list দেখুন
          </Button>
        </section>

        <section className="card-surface space-y-3 p-4">
          <div>
            <h3 className="font-medium">Available dates</h3>
            <p className="text-xs text-muted-foreground">
              GET /api/external/takamol-availability/v1/dates
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category ID">
              <Input
                value={dateCategoryId}
                onChange={(event) => setDateCategoryId(event.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="City">
              <Input
                value={dateCity}
                onChange={(event) => setDateCity(event.target.value)}
                maxLength={120}
                placeholder="Dhaka"
              />
            </Field>
          </div>
          <Button
            type="button"
            disabled={lookup.isPending || !dateCategoryId.trim() || !dateCity.trim()}
            onClick={() =>
              runLookup({
                endpoint: "dates",
                categoryId: dateCategoryId.trim(),
                city: dateCity.trim(),
              })
            }
          >
            Available dates দেখুন
          </Button>
        </section>

        <section className="card-surface space-y-3 p-4">
          <div>
            <h3 className="font-medium">Test centers</h3>
            <p className="text-xs text-muted-foreground">
              GET /api/external/takamol-availability/v1/centers
            </p>
          </div>
          <Field label="City (optional; leave blank for all centers)">
            <Input
              value={centerCity}
              onChange={(event) => setCenterCity(event.target.value)}
              maxLength={120}
              placeholder="Dhaka"
            />
          </Field>
          <Button
            type="button"
            disabled={lookup.isPending}
            onClick={() => runLookup({ endpoint: "centers", city: centerCity.trim() || undefined })}
          >
            Test centers দেখুন
          </Button>
        </section>

        <section className="card-surface space-y-3 p-4 lg:col-span-2">
          <div>
            <h3 className="font-medium">Exam sessions</h3>
            <p className="text-xs text-muted-foreground">
              GET /api/external/takamol-availability/v1/sessions
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Category ID">
              <Input
                value={sessionCategoryId}
                onChange={(event) => setSessionCategoryId(event.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="City">
              <Input
                value={sessionCity}
                onChange={(event) => setSessionCity(event.target.value)}
                maxLength={120}
                placeholder="Dhaka"
              />
            </Field>
            <Field label="Exam date">
              <Input
                type="date"
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
              />
            </Field>
            <Field label="Test center ID (optional)">
              <Input
                value={testCenterId}
                onChange={(event) => setTestCenterId(event.target.value)}
                maxLength={120}
              />
            </Field>
          </div>
          <Button
            type="button"
            disabled={
              lookup.isPending || !sessionCategoryId.trim() || !sessionCity.trim() || !examDate
            }
            onClick={() =>
              runLookup({
                endpoint: "sessions",
                categoryId: sessionCategoryId.trim(),
                city: sessionCity.trim(),
                examDate,
                testCenterId: testCenterId.trim() || undefined,
              })
            }
          >
            Exam sessions দেখুন
          </Button>
        </section>
      </div>

      {lookup.isPending && <p className="text-sm text-muted-foreground">তথ্য লোড হচ্ছে...</p>}
      {lookup.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          Takamol lookup failed. Check your access and server configuration.
        </p>
      )}
      {result?.success === false && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {result.message} (HTTP {result.status})
        </p>
      )}
      {result?.success === true && (
        <section className="card-surface space-y-2 p-4">
          <h3 className="font-medium">
            {activeEndpoint ? endpointLabels[activeEndpoint] : "Takamol response"}
          </h3>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs">
            {JSON.stringify(result.data, null, 2) ?? "null"}
          </pre>
        </section>
      )}
    </div>
  );
}
