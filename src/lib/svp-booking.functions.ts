import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSvpReservationBody,
  parseSvpAvailableDates,
  parseSvpCities,
  parseSvpCredits,
  parseSvpError,
  parseSvpExamSessions,
  parseSvpOccupations,
  parseSvpPermissions,
  parseSvpReservation,
  parseSvpReservations,
  type SvpAvailableDate,
  type SvpBookingPermissions,
  type SvpCity,
  type SvpEligibility,
  type SvpExamSession,
  type SvpOccupation,
  type SvpReservation,
} from "@/lib/svp-api.shared";
import {
  readStoredSvpSession,
  requireSvpAllowedRole,
  SvpSessionMissingError,
  svpAuthedRequest,
} from "@/lib/svp-session.server";

export type SvpResult<T> =
  { ok: true; data: T } | { ok: false; message: string; needsSignIn: boolean };

function failure(
  message: string,
  needsSignIn = false,
): { ok: false; message: string; needsSignIn: boolean } {
  return { ok: false, message, needsSignIn };
}

function apiFailure(payload: unknown, fallback: string): string {
  return parseSvpError(payload) ?? fallback;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const LOCALE_QUERY = { locale: "en" } as const;

const categoryInput = z.object({
  categoryId: z.number().int().positive(),
  countryId: z.number().int().positive().nullable().optional(),
});

/** Permissions (free reservations / targeted country) and credit balance. */
export const getSvpBookingSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ occupationId: z.number().int().positive().nullable().optional() }).parse(input),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<
      SvpResult<{ permissions: SvpBookingPermissions; credits: number; svpUserId: string | null }>
    > => {
      await requireSvpAllowedRole(context.supabase, context.userId);
      try {
        const permissionsResponse = await svpAuthedRequest(
          context.userId,
          "/individual_labor_space/permissions",
          { query: LOCALE_QUERY },
        );
        if (!permissionsResponse.ok) {
          return failure(
            apiFailure(permissionsResponse.payload, "SVP permissions could not be loaded."),
          );
        }
        const permissions = parseSvpPermissions(permissionsResponse.payload);
        const session = readStoredSvpSession(context.userId);
        let credits = 0;
        if (session?.svpUserId && data.occupationId) {
          const creditsResponse = await svpAuthedRequest(
            context.userId,
            `/users/${encodeURIComponent(session.svpUserId)}/balance`,
            {
              query: {
                ...LOCALE_QUERY,
                methodology_type: "in_person",
                occupation_id: data.occupationId,
              },
            },
          );
          if (creditsResponse.ok) credits = parseSvpCredits(creditsResponse.payload);
        }
        return {
          ok: true,
          data: { permissions, credits, svpUserId: session?.svpUserId ?? null },
        };
      } catch (error) {
        if (error instanceof SvpSessionMissingError) return failure(error.message, true);
        return failure("SVP booking setup could not be loaded.");
      }
    },
  );

/** Occupations available in the signed-in labor's space. */
export const listSvpBookingOccupations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SvpResult<SvpOccupation[]>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const response = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/occupations",
        { query: { ...LOCALE_QUERY, per_page: 500, page: 1, name: "" } },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "Occupations could not be loaded."));
      }
      return { ok: true, data: parseSvpOccupations(response.payload) };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("Occupations could not be loaded.");
    }
  });

/** Test-center cities for the signed-in labor's country. */
export const listSvpTestCenterCities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SvpResult<SvpCity[]>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const response = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/test_centers/cities",
        { query: { ...LOCALE_QUERY, per_page: 1000 } },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "Test center cities could not be loaded."));
      }
      return { ok: true, data: parseSvpCities(response.payload) };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("Test center cities could not be loaded.");
    }
  });

/** Run the three SVP pre-booking validations for a category. */
export const checkSvpBookingEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categoryInput.parse(input))
  .handler(async ({ context, data }): Promise<SvpResult<SvpEligibility[]>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    const checks: { key: SvpEligibility["key"]; label: string }[] = [
      { key: "passport_expiration_condition", label: "Passport validity" },
      { key: "booking_availability_condition", label: "Booking availability" },
      { key: "already_existing_booking", label: "Existing booking check" },
    ];
    try {
      const results: SvpEligibility[] = [];
      for (const check of checks) {
        const response = await svpAuthedRequest(
          context.userId,
          "/individual_labor_space/exam_reservations/validate",
          {
            query: {
              ...LOCALE_QUERY,
              condition: check.key,
              ...(check.key === "passport_expiration_condition"
                ? {}
                : { category_id: data.categoryId }),
            },
          },
        );
        results.push({
          ...check,
          passed: response.ok,
          message: response.ok ? "Passed" : (response.message ?? "SVP did not accept this check."),
        });
      }
      return { ok: true, data: results };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("Eligibility checks could not be completed.");
    }
  });

/** Calendar dates with free seats for a category. */
export const listSvpAvailableDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categoryInput.parse(input))
  .handler(async ({ context, data }): Promise<SvpResult<SvpAvailableDate[]>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const response = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/exam_sessions/available_dates",
        {
          query: {
            ...LOCALE_QUERY,
            category_id: data.categoryId,
            ...(data.countryId ? { country_id: data.countryId } : {}),
            start_at_date_from: new Date().toISOString().slice(0, 10),
            available_seats: "greater_than::0",
            status: "scheduled",
            per_page: 1000,
          },
        },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "Available dates could not be loaded."));
      }
      return { ok: true, data: parseSvpAvailableDates(response.payload) };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("Available dates could not be loaded.");
    }
  });

/** Exam sessions for one date + city. */
export const listSvpExamSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        categoryId: z.number().int().positive(),
        city: z.string().trim().min(1).max(120),
        examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<SvpExamSession[]>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const response = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/exam_sessions",
        {
          query: {
            ...LOCALE_QUERY,
            category_id: data.categoryId,
            city: data.city,
            exam_date: data.examDate,
            available_seats: "greater_than::0",
          },
        },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "Exam sessions could not be loaded."));
      }
      return { ok: true, data: parseSvpExamSessions(response.payload) };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("Exam sessions could not be loaded.");
    }
  });

/** Existing SVP reservations for the signed-in labor. */
export const listSvpReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SvpResult<SvpReservation[]>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const response = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/exam_reservations",
        { query: LOCALE_QUERY },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "SVP reservations could not be loaded."));
      }
      return { ok: true, data: parseSvpReservations(response.payload) };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("SVP reservations could not be loaded.");
    }
  });

export type SvpBookingResult = {
  reservationId: string;
  paid: boolean;
  paymentRequired: boolean;
  credits: number;
  message: string;
};

/** Create the reservation with the real SVP payload, then settle it with free seats or credits. */
export const createSvpBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        occupationId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        examSessionId: z.number().int().positive(),
        languageCode: z.string().trim().min(1).max(20),
        duration: z.number().nonnegative(),
        startAt: z.string().trim().min(1).max(64),
        siteId: z.number().int().positive().nullable().optional(),
        siteCity: z.string().trim().max(120).nullable().optional(),
        countryId: z.number().int().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<SvpBookingResult>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const pending = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/payments/validate_pending",
        { query: LOCALE_QUERY },
      );
      if (!pending.ok) {
        return failure(apiFailure(pending.payload, "Pending payments could not be checked."));
      }
      const pendingRecord = record(pending.payload);
      const canProceed =
        record(pendingRecord?.["data"])?.["can_proceed"] ?? pendingRecord?.["can_proceed"];
      if (canProceed === false) {
        return failure(
          "A previous SVP payment is still being processed. Wait for it to finish before booking again.",
        );
      }

      const create = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/exam_reservations",
        {
          method: "POST",
          query: LOCALE_QUERY,
          body: buildSvpReservationBody({
            examSessionId: data.examSessionId,
            occupationId: data.occupationId,
            languageCode: data.languageCode,
            duration: data.duration,
            startAt: data.startAt,
            siteId: data.siteId ?? null,
            siteCity: data.siteCity ?? null,
            holdId: null,
            countryId: data.countryId ?? null,
          }),
        },
      );
      if (!create.ok) {
        return failure(
          apiFailure(create.payload, "SVP did not accept the reservation. Check the details."),
        );
      }

      const reservation = parseSvpReservation(create.payload);
      if (!reservation.id) {
        return failure("SVP did not return a reservation number. Book again from the portal.");
      }

      const permissionsResponse = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/permissions",
        { query: LOCALE_QUERY },
      );
      const permissions = permissionsResponse.ok
        ? parseSvpPermissions(permissionsResponse.payload)
        : { freeReservations: false, targeted: false, countryId: null, countryName: null };

      if (permissions.freeReservations) {
        return {
          ok: true,
          data: {
            reservationId: reservation.id,
            paid: true,
            paymentRequired: false,
            credits: 0,
            message: "Reservation confirmed by SVP. No payment is required.",
          },
        };
      }

      const session = readStoredSvpSession(context.userId);
      let credits = 0;
      if (session?.svpUserId) {
        const creditsResponse = await svpAuthedRequest(
          context.userId,
          `/users/${encodeURIComponent(session.svpUserId)}/balance`,
          {
            query: {
              ...LOCALE_QUERY,
              methodology_type: "in_person",
              occupation_id: data.occupationId,
            },
          },
        );
        if (creditsResponse.ok) credits = parseSvpCredits(creditsResponse.payload);
      }

      if (credits > 0) {
        const payment = await svpAuthedRequest(
          context.userId,
          "/individual_labor_space/reservation_credits/use",
          {
            method: "POST",
            query: LOCALE_QUERY,
            body: {
              methodology_type: "in_person",
              reservation_id: reservation.id,
              occupation_id: data.occupationId,
            },
          },
        );
        if (payment.ok) {
          return {
            ok: true,
            data: {
              reservationId: reservation.id,
              paid: true,
              paymentRequired: false,
              credits,
              message: "Reservation confirmed and paid with SVP credits.",
            },
          };
        }
        return {
          ok: true,
          data: {
            reservationId: reservation.id,
            paid: false,
            paymentRequired: true,
            credits,
            message:
              parseSvpError(payment.payload) ??
              "Reservation created, but the credit payment did not complete. Pay in the official SVP portal.",
          },
        };
      }

      return {
        ok: true,
        data: {
          reservationId: reservation.id,
          paid: false,
          paymentRequired: true,
          credits,
          message:
            "Reservation created. Complete the payment in the official SVP portal to confirm it.",
        },
      };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("The SVP reservation could not be created.");
    }
  });
