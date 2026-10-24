import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSvpReservationBody,
  parseSvpAccountPermissions,
  parseSvpAvailableDates,
  parseSvpCities,
  parseSvpConstraints,
  parseSvpCredits,
  parseSvpError,
  parseSvpExamSessions,
  parseSvpFeatureFlags,
  parseSvpOccupations,
  parseSvpPermissions,
  parseSvpPrometricSites,
  parseSvpPrometricSlots,
  parseSvpReservation,
  parseSvpReservationDetail,
  parseSvpReservations,
  type SvpAccountPermissions,
  type SvpAvailableDate,
  type SvpBookingPermissions,
  type SvpCity,
  type SvpConstraints,
  type SvpEligibility,
  type SvpExamSession,
  type SvpFeatureFlags,
  type SvpOccupation,
  type SvpPrometricSiteList,
  type SvpPrometricSlot,
  type SvpReservation,
  type SvpReservationDetail,
} from "@/lib/svp-api.shared";
import {
  readStoredSvpSession,
  requireSvpAllowedRole,
  SvpSessionMissingError,
  svpAuthedBinary,
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

/** Server-side similar-occupation search using the SVP `name` filter. */
export const searchSvpOccupations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().trim().max(120) }).parse(input))
  .handler(async ({ context, data }): Promise<SvpResult<SvpOccupation[]>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    if (!data.query) return { ok: true, data: [] };
    try {
      const response = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/occupations",
        { query: { ...LOCALE_QUERY, per_page: 60, page: 1, name: data.query } },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "Similar occupations could not be loaded."));
      }
      return { ok: true, data: parseSvpOccupations(response.payload) };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("Similar occupations could not be loaded.");
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
        examSessionId: z.union([z.number().int().positive(), z.string().trim().min(1).max(40)]),
        languageCode: z.string().trim().min(1).max(20),
        duration: z.number().nonnegative(),
        startAt: z.string().trim().min(1).max(64),
        siteId: z.number().int().positive().nullable().optional(),
        siteCity: z.string().trim().max(120).nullable().optional(),
        holdId: z.string().trim().max(64).nullable().optional(),
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

      if (data.holdId) {
        // The portal holds the temporary seat again for a held slot; best effort, like the portal.
        await svpAuthedRequest(context.userId, "/individual_labor_space/temporary_seats", {
          method: "POST",
          query: LOCALE_QUERY,
          body: {
            exam_session_id: data.holdId,
            country_id: data.countryId ?? null,
            category_id: data.categoryId,
          },
        }).catch(() => undefined);
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
            holdId: data.holdId ?? null,
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

export type SvpTicketFile = { base64: string; contentType: string };

/** Download the official SVP ticket PDF for a reservation. */
export const downloadSvpTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{1,64}$/),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<SvpTicketFile>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const response = await svpAuthedBinary(
        context.userId,
        `/individual_labor_space/tickets/${encodeURIComponent(data.reservationId)}/show_pdf`,
      );
      if (!response.ok || !response.base64) {
        return failure(response.message ?? "The SVP ticket could not be downloaded.");
      }
      return {
        ok: true,
        data: {
          base64: response.base64,
          contentType: response.contentType ?? "application/pdf",
        },
      };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("The SVP ticket could not be downloaded.");
    }
  });

export type SvpAccountOverview = {
  permissions: SvpAccountPermissions;
  constraints: SvpConstraints;
  flags: SvpFeatureFlags;
  credits: number;
};

/** Everything the SVP account is allowed to do: country permissions, policies and flags. */
export const getSvpAccountOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ occupationId: z.number().int().positive().nullable().optional() }).parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<SvpAccountOverview>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const [permissionsResponse, constraintsResponse, flagsResponse] = await Promise.all([
        svpAuthedRequest(context.userId, "/individual_labor_space/permissions", {
          query: LOCALE_QUERY,
        }),
        svpAuthedRequest(context.userId, "/individual_labor_space/exam_constraints", {
          query: LOCALE_QUERY,
        }),
        svpAuthedRequest(context.userId, "/flipper/feature_flags", { query: LOCALE_QUERY }),
      ]);
      if (!permissionsResponse.ok) {
        return failure(
          apiFailure(permissionsResponse.payload, "SVP account permissions could not be loaded."),
        );
      }
      const permissions = parseSvpAccountPermissions(permissionsResponse.payload);
      const constraints = constraintsResponse.ok
        ? parseSvpConstraints(constraintsResponse.payload)
        : { rescheduleTimes: 0, bookingHoldSeconds: 0, cancellationLimitHours: null };
      const flags = flagsResponse.ok
        ? parseSvpFeatureFlags(flagsResponse.payload)
        : { rescheduleEnabled: false, creditsEnabled: false };

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
      return { ok: true, data: { permissions, constraints, flags, credits } };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("SVP account permissions could not be loaded.");
    }
  });

/** Full reservation record, including whether SVP allows rescheduling it. */
export const getSvpReservationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{1,64}$/),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<SvpReservationDetail>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const response = await svpAuthedRequest(
        context.userId,
        `/individual_labor_space/exam_reservations/${encodeURIComponent(data.reservationId)}`,
        { query: LOCALE_QUERY },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "The reservation could not be loaded."));
      }
      const detail = parseSvpReservationDetail(response.payload);
      if (!detail) return failure("SVP did not return reservation details.");
      return { ok: true, data: detail };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("The reservation could not be loaded.");
    }
  });

/** Available dates for rescheduling, starting two days ahead like the portal. */
export const listSvpRescheduleDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{1,64}$/),
        categoryId: z.number().int().positive(),
        countryId: z.number().int().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<SvpAvailableDate[]>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const from = new Date();
      from.setUTCDate(from.getUTCDate() + 2);
      const response = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/exam_sessions/available_dates",
        {
          query: {
            ...LOCALE_QUERY,
            reservation_id: data.reservationId,
            category_id: data.categoryId,
            ...(data.countryId ? { country_id: data.countryId } : {}),
            start_at_date_from: from.toISOString().slice(0, 10),
            available_seats: "greater_than::0",
            status: "scheduled",
            per_page: 1000,
          },
        },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "Reschedule dates could not be loaded."));
      }
      return { ok: true, data: parseSvpAvailableDates(response.payload) };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("Reschedule dates could not be loaded.");
    }
  });

/**
 * Real SVP reschedule: hold the new seat, then POST exam_reservations/{id}/reschedule
 * with { id, exam_session_id, language_code } exactly like the portal.
 */
export const rescheduleSvpBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{1,64}$/),
        examSessionId: z.union([z.number().int().positive(), z.string().trim().min(1).max(40)]),
        languageCode: z.string().trim().min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<{ message: string }>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const [detailResponse, constraintsResponse, flagsResponse] = await Promise.all([
        svpAuthedRequest(
          context.userId,
          `/individual_labor_space/exam_reservations/${encodeURIComponent(data.reservationId)}`,
          { query: LOCALE_QUERY },
        ),
        svpAuthedRequest(context.userId, "/individual_labor_space/exam_constraints", {
          query: LOCALE_QUERY,
        }),
        svpAuthedRequest(context.userId, "/flipper/feature_flags", { query: LOCALE_QUERY }),
      ]);

      if (detailResponse.ok) {
        const detail = parseSvpReservationDetail(detailResponse.payload);
        if (detail && !detail.canBeRescheduled) {
          return failure("SVP does not allow rescheduling this reservation.");
        }
      }
      if (flagsResponse.ok) {
        const flags = parseSvpFeatureFlags(flagsResponse.payload);
        if (!flags.rescheduleEnabled) {
          return failure("SVP rescheduling is disabled for this account.");
        }
      }
      if (constraintsResponse.ok) {
        const constraints = parseSvpConstraints(constraintsResponse.payload);
        if (constraints.rescheduleTimes <= 0) {
          return failure("No reschedules are left for this reservation.");
        }
      }

      const hold = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/temporary_seats",
        {
          method: "POST",
          query: LOCALE_QUERY,
          body: { exam_session_id: data.examSessionId },
        },
      );
      if (!hold.ok) {
        return failure(
          apiFailure(hold.payload, "SVP could not hold the new seat. Choose another session."),
        );
      }

      const response = await svpAuthedRequest(
        context.userId,
        `/individual_labor_space/exam_reservations/${encodeURIComponent(data.reservationId)}/reschedule`,
        {
          method: "POST",
          query: LOCALE_QUERY,
          body: {
            id: data.reservationId,
            exam_session_id: data.examSessionId,
            language_code: data.languageCode,
          },
        },
      );
      if (!response.ok) {
        return failure(
          apiFailure(response.payload, "SVP did not accept the reschedule. Check the policy."),
        );
      }
      return { ok: true, data: { message: "Appointment rescheduled with SVP." } };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("The appointment could not be rescheduled.");
    }
  });

/** Site availability for non-targeted (site-based) countries. */
export const listSvpPrometricSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prometricCode: z.string().trim().min(1).max(20),
        city: z.string().trim().min(1).max(120),
        countryId: z.number().int().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<SvpPrometricSiteList>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const now = new Date();
      const start = now.toISOString().slice(0, 10);
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
        .toISOString()
        .slice(0, 10);
      const response = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/prometric_scheduling/sites_availabilities",
        {
          query: {
            ...LOCALE_QUERY,
            prometric_code: data.prometricCode,
            city: data.city,
            start_date: start,
            end_date: end,
            ...(data.countryId ? { country_id: data.countryId } : {}),
          },
        },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "Test center sites could not be loaded."));
      }
      return { ok: true, data: parseSvpPrometricSites(response.payload) };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("Test center sites could not be loaded.");
    }
  });

/** Free slots for the selected day across the given sites. */
export const listSvpPrometricSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        examId: z.string().trim().min(1).max(40),
        siteIds: z.array(z.number().int().positive()).min(1).max(200),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<SvpPrometricSlot[]>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const response = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/prometric_scheduling/slots_availabilities",
        {
          query: {
            ...LOCALE_QUERY,
            site_ids: data.siteIds,
            exam_id: data.examId,
            start_date: data.date,
            end_date: data.date,
          },
        },
      );
      if (!response.ok) {
        return failure(apiFailure(response.payload, "Slots could not be loaded."));
      }
      return { ok: true, data: parseSvpPrometricSlots(response.payload) };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("Slots could not be loaded.");
    }
  });

/** Hold a selected slot before creating the site-based reservation. */
export const createSvpPrometricHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        slotId: z.string().trim().min(1).max(64),
        siteId: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(
    async ({ context, data }): Promise<SvpResult<{ holdId: string; expiresAt: string | null }>> => {
      await requireSvpAllowedRole(context.supabase, context.userId);
      try {
        const response = await svpAuthedRequest(
          context.userId,
          "/individual_labor_space/prometric_scheduling/slots_availabilities",
          {
            method: "POST",
            query: LOCALE_QUERY,
            body: { slot_id: data.slotId, site_id: data.siteId },
          },
        );
        if (!response.ok) {
          return failure(apiFailure(response.payload, "SVP could not hold this slot."));
        }
        const root = record(response.payload);
        const payload = record(root?.["data"]) ?? root;
        const holdValue = payload?.["id"] ?? root?.["id"];
        if (holdValue === undefined || holdValue === null) {
          return failure("SVP did not return a seat hold. Choose another slot.");
        }
        return {
          ok: true,
          data: {
            holdId: String(holdValue),
            expiresAt: typeof payload?.["expired_at"] === "string" ? payload["expired_at"] : null,
          },
        };
      } catch (error) {
        if (error instanceof SvpSessionMissingError) return failure(error.message, true);
        return failure("SVP could not hold this slot.");
      }
    },
  );

/** Shared reschedule gates: reservation flag, feature flag and remaining quota. */
async function assertRescheduleAllowed(
  userId: string,
  reservationId: string,
): Promise<{ ok: false; message: string; needsSignIn: boolean } | null> {
  const [detailResponse, constraintsResponse, flagsResponse] = await Promise.all([
    svpAuthedRequest(
      userId,
      `/individual_labor_space/exam_reservations/${encodeURIComponent(reservationId)}`,
      { query: LOCALE_QUERY },
    ),
    svpAuthedRequest(userId, "/individual_labor_space/exam_constraints", { query: LOCALE_QUERY }),
    svpAuthedRequest(userId, "/flipper/feature_flags", { query: LOCALE_QUERY }),
  ]);

  if (detailResponse.ok) {
    const detail = parseSvpReservationDetail(detailResponse.payload);
    if (detail && !detail.canBeRescheduled) {
      return failure("SVP does not allow rescheduling this reservation.");
    }
  }
  if (flagsResponse.ok) {
    const flags = parseSvpFeatureFlags(flagsResponse.payload);
    if (!flags.rescheduleEnabled) {
      return failure("SVP rescheduling is disabled for this account.");
    }
  }
  if (constraintsResponse.ok) {
    const constraints = parseSvpConstraints(constraintsResponse.payload);
    if (constraints.rescheduleTimes <= 0) {
      return failure("No reschedules are left for this reservation.");
    }
  }
  return null;
}

/**
 * Site-based (non-targeted) reschedule: hold the new slot, then reschedule with
 * the prometric exam id + site/hold fields. Some SVP deployments expect the
 * slot id instead, so a rejected request is retried with that shape.
 */
export const rescheduleSvpSiteBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9-]{1,64}$/),
        examId: z.string().trim().min(1).max(40),
        slotId: z.string().trim().min(1).max(64),
        siteId: z.number().int().positive(),
        siteCity: z.string().trim().max(120).nullable().optional(),
        languageCode: z.string().trim().min(1).max(20),
        duration: z.number().nonnegative(),
        startAt: z.string().trim().min(1).max(64),
        categoryId: z.number().int().positive(),
        countryId: z.number().int().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<SvpResult<{ message: string }>> => {
    await requireSvpAllowedRole(context.supabase, context.userId);
    try {
      const blocked = await assertRescheduleAllowed(context.userId, data.reservationId);
      if (blocked) return blocked;

      const hold = await svpAuthedRequest(
        context.userId,
        "/individual_labor_space/prometric_scheduling/slots_availabilities",
        {
          method: "POST",
          query: LOCALE_QUERY,
          body: { slot_id: data.slotId, site_id: data.siteId },
        },
      );
      if (!hold.ok) {
        return failure(apiFailure(hold.payload, "SVP could not hold the new slot."));
      }
      const holdRoot = record(hold.payload);
      const holdPayload = record(holdRoot?.["data"]) ?? holdRoot;
      const holdValue = holdPayload?.["id"] ?? holdRoot?.["id"];
      const holdId = holdValue === undefined || holdValue === null ? null : String(holdValue);

      if (holdId) {
        await svpAuthedRequest(context.userId, "/individual_labor_space/temporary_seats", {
          method: "POST",
          query: LOCALE_QUERY,
          body: {
            exam_session_id: holdId,
            country_id: data.countryId ?? null,
            category_id: data.categoryId,
          },
        }).catch(() => undefined);
      }

      const path = `/individual_labor_space/exam_reservations/${encodeURIComponent(
        data.reservationId,
      )}/reschedule`;

      let response = await svpAuthedRequest(context.userId, path, {
        method: "POST",
        query: LOCALE_QUERY,
        body: {
          id: data.reservationId,
          exam_session_id: data.examId,
          language_code: data.languageCode,
          site_id: data.siteId,
          site_city: data.siteCity ?? null,
          hold_id: holdId,
          duration: data.duration,
          start_at: data.startAt,
          country_id: data.countryId ?? null,
        },
      });

      if (!response.ok) {
        response = await svpAuthedRequest(context.userId, path, {
          method: "POST",
          query: LOCALE_QUERY,
          body: {
            id: data.reservationId,
            exam_session_id: data.slotId,
            language_code: data.languageCode,
            site_id: data.siteId,
            site_city: data.siteCity ?? null,
            hold_id: holdId,
          },
        });
      }

      if (!response.ok) {
        return failure(
          apiFailure(response.payload, "SVP did not accept the site-based reschedule."),
        );
      }
      return { ok: true, data: { message: "Appointment rescheduled with SVP." } };
    } catch (error) {
      if (error instanceof SvpSessionMissingError) return failure(error.message, true);
      return failure("The appointment could not be rescheduled.");
    }
  });
