import { describe, expect, it } from "vitest";
import {
  buildSvpReservationBody,
  parseSvpAvailableDates,
  parseSvpCities,
  parseSvpCredits,
  parseSvpExamSessions,
  parseSvpOccupations,
  parseSvpPermissions,
  parseSvpPrometricSites,
  parseSvpPrometricSlots,
  parseSvpAccountPermissions,
  parseSvpConstraints,
  parseSvpFeatureFlags,
  parseSvpReservation,
  parseSvpReservationDetail,
  parseSvpReservations,
  svpTicketFileName,
} from "@/lib/svp-api.shared";
import { extractSvpAuthPayload, extractSvpSessionUser } from "@/lib/svp-session.shared";

describe("SVP booking payload", () => {
  it("matches the portal create-reservation body exactly", () => {
    expect(
      buildSvpReservationBody({
        examSessionId: 501,
        occupationId: 11,
        languageCode: "en",
        duration: 3600,
        startAt: "2026-11-05 09:30:00",
        siteId: null,
        siteCity: "Dhaka",
        holdId: null,
        countryId: 4,
      }),
    ).toEqual({
      exam_session_id: 501,
      occupation_id: 11,
      language_code: "en",
      site_id: null,
      site_city: "Dhaka",
      hold_id: null,
      duration: 3600,
      start_at: "2026-11-05 09:30:00",
      country_id: 4,
    });
  });
});

describe("SVP response parsers", () => {
  it("reads occupations with category and language codes", () => {
    const occupations = parseSvpOccupations({
      occupations: [
        {
          id: 11,
          name: "Welder",
          arabic_name: "لحام",
          occupation_key: "721201",
          category: {
            id: 159,
            name: "Welding",
            prometric_codes: [
              { code: "en", name: "English", question_count: 30 },
              { code: "ar", name: "Arabic", question_count: 30 },
              { code: "en", name: "English", question_count: 30 },
            ],
          },
        },
      ],
    });

    expect(occupations).toEqual([
      {
        id: 11,
        name: "Welder",
        arabicName: "لحام",
        occupationKey: "721201",
        categoryId: 159,
        categoryName: "Welding",
        languages: [
          { code: "en", label: "English", questionCount: 30, nonTargeted: false },
          { code: "ar", label: "Arabic", questionCount: 30, nonTargeted: false },
        ],
        driverLicenseRequired: false,
      },
    ]);
  });

  it("reads test center cities and de-duplicates them", () => {
    expect(
      parseSvpCities({
        cities: [
          { city: "Dhaka", country_id: 4 },
          { city: "dhaka", country_id: 4 },
          { city: "Chattogram", country: { id: 4 } },
        ],
      }),
    ).toEqual([
      { city: "Chattogram", countryId: 4 },
      { city: "Dhaka", countryId: 4 },
    ]);
  });

  it("reads permissions, credits and available dates", () => {
    expect(
      parseSvpPermissions({
        country: { id: 4, english_name: "Bangladesh", free_reservations: true, targeted: true },
      }),
    ).toEqual({
      freeReservations: true,
      targeted: true,
      loadBalancer: false,
      countryId: 4,
      countryName: "Bangladesh",
    });
    expect(parseSvpCredits({ data: { reservation_credits: 2 } })).toBe(2);
    expect(
      parseSvpAvailableDates({
        available_dates: [
          {
            start_at_in_tc_time_zone: "2026-11-05 09:30:00",
            test_center: { city: "Dhaka", name: "Dhaka Center" },
          },
        ],
      }),
    ).toEqual([{ startAt: "2026-11-05 09:30:00", city: "Dhaka", centerName: "Dhaka Center" }]);
  });

  it("reads exam sessions with seat and duration data", () => {
    expect(
      parseSvpExamSessions({
        exam_sessions: [
          {
            id: 501,
            start_at: "2026-11-05 09:30:00",
            end_at: "2026-11-05 10:30:00",
            duration: 3600,
            available_seats: 7,
            test_center: { city: "Dhaka", name: "Dhaka Center" },
          },
        ],
      }),
    ).toEqual([
      {
        id: 501,
        startAt: "2026-11-05 09:30:00",
        endAt: "2026-11-05 10:30:00",
        duration: 3600,
        availableSeats: 7,
        city: "Dhaka",
        centerName: "Dhaka Center",
        siteId: null,
      },
    ]);
  });

  it("reads the created reservation id and the account reservation list", () => {
    expect(parseSvpReservation({ data: { id: 987 } })).toEqual({
      id: "987",
      status: null,
    });
    expect(
      parseSvpReservations({
        exam_reservations: [
          {
            id: 987,
            reservation_status: "reserved",
            can_be_rescheduled: true,
            category_id: 159,
            occupation: { name: "Welder", english_name: "Welder" },
            labor: { full_name: "Noor Rahman" },
            exam_session: {
              id: 501,
              duration: 3600,
              start_at: "2026-11-05 09:30:00",
              test_center: { city: "Dhaka", name: "Dhaka Center" },
            },
          },
        ],
      }),
    ).toEqual([
      {
        id: "987",
        status: "reserved",
        laborName: "Noor Rahman",
        occupationName: "Welder",
        occupationEnglishName: "Welder",
        city: "Dhaka",
        centerName: "Dhaka Center",
        startAt: "2026-11-05 09:30:00",
        methodology: null,
        languageCode: null,
        canBeRescheduled: true,
        categoryId: 159,
        examSessionId: 501,
        duration: 3600,
      },
    ]);
  });
});

describe("SVP OTP session extraction", () => {
  it("reads access token, expiry and labor identity from the OTP payload", () => {
    const payload = {
      data: {
        access_payload: { access: "ACCESS_TOKEN", access_expires_at: "2026-11-05T10:00:00Z" },
        user: { id: 969955, full_name: "Noor Rahman", country: { targeted: true } },
      },
    };

    expect(extractSvpAuthPayload(payload)).toEqual({
      access: "ACCESS_TOKEN",
      accessExpiresAt: Math.floor(Date.parse("2026-11-05T10:00:00Z") / 1000),
    });
    expect(extractSvpSessionUser(payload)).toEqual({ id: "969955", name: "Noor Rahman" });
  });

  it("also accepts a refresh-style body without the data envelope", () => {
    expect(extractSvpAuthPayload({ access: "NEW_TOKEN", access_expires_at: 1800000000 })).toEqual({
      access: "NEW_TOKEN",
      accessExpiresAt: 1800000000,
    });
  });
});

describe("SVP ticket file name", () => {
  it("uses the candidate name and occupation English name", () => {
    expect(svpTicketFileName("Noor Rahman", "Welder")).toBe("Noor_Rahman_Welder_SVP_Ticket.pdf");
    expect(svpTicketFileName("  md. sojib / hossain ", "Heavy Equipment Operator")).toBe(
      "md_sojib_hossain_Heavy_Equipment_Operator_SVP_Ticket.pdf",
    );
  });

  it("falls back safely when a value is missing or not Latin text", () => {
    expect(svpTicketFileName(null, undefined)).toBe("Candidate_Occupation_SVP_Ticket.pdf");
    expect(svpTicketFileName("  ", "")).toBe("Candidate_Occupation_SVP_Ticket.pdf");
  });
});

describe("SVP reschedule and account parsers", () => {
  it("reads reservation details needed for rescheduling", () => {
    const detail = parseSvpReservationDetail({
      data: {
        id: 987,
        reservation_status: "reserved",
        can_be_rescheduled: true,
        occupation_id: 11,
        occupation: { name: "Welder", english_name: "Welder" },
        category: {
          id: 159,
          name: "Welding",
          prometric_codes: [{ code: "en", name: "English" }],
        },
        exam_session: {
          id: 501,
          duration: 3600,
          start_at_in_tc_time_zone: "2026-11-05 09:30:00",
          test_center: { city: "Dhaka", name: "Dhaka Center" },
        },
      },
    });

    expect(detail).toEqual({
      id: "987",
      status: "reserved",
      laborName: null,
      occupationName: "Welder",
      occupationEnglishName: "Welder",
      city: "Dhaka",
      centerName: "Dhaka Center",
      startAt: "2026-11-05 09:30:00",
      methodology: null,
      languageCode: null,
      canBeRescheduled: true,
      categoryId: 159,
      examSessionId: 501,
      duration: 3600,
      occupationId: 11,
      categoryName: "Welding",
      languages: [{ code: "en", label: "English", questionCount: null, nonTargeted: false }],
      countryId: null,
    });
  });

  it("reads constraints, feature flags and labor permission keys", () => {
    expect(
      parseSvpConstraints({
        data: {
          reservation_rescheduling: 2,
          reservation_duration: 600,
          labor_reservation_cancellation_limit: 48,
        },
      }),
    ).toEqual({ rescheduleTimes: 2, bookingHoldSeconds: 600, cancellationLimitHours: 48 });

    expect(
      parseSvpFeatureFlags({
        feature_flags: [
          { name: "enable_labor_rescheduling_flow", state: "true" },
          { name: "labor_reservation_credits", state: "false" },
        ],
      }),
    ).toEqual({ rescheduleEnabled: true, creditsEnabled: false });

    const permissions = parseSvpAccountPermissions({
      country: { id: 4, english_name: "Bangladesh", free_reservations: false, targeted: true },
      permissions: {
        legislator: {
          labors: {
            book_appointment: true,
            reschedule_appointment: true,
            cancel_appointment: false,
          },
        },
      },
    });

    expect(permissions.freeReservations).toBe(false);
    expect(permissions.targeted).toBe(true);
    expect(permissions.permissionKeys).toEqual(["book_appointment", "reschedule_appointment"]);
  });
});

describe("SVP site-based booking parsers", () => {
  it("reads sites, exam id and available dates", () => {
    expect(
      parseSvpPrometricSites({
        data: {
          exam_id: "555",
          sites: [
            {
              site_id: 9,
              test_center: {
                name: "Site A",
                address: { locality: "Dhaka", formattedAddress: "1 Test Road, Dhaka" },
              },
              available_dates: ["2026-12-01", "2026-12-02T00:00:00"],
            },
          ],
        },
      }),
    ).toEqual({
      examId: "555",
      sites: [
        {
          siteId: 9,
          name: "Site A",
          city: "Dhaka",
          address: "1 Test Road, Dhaka",
          dates: ["2026-12-01", "2026-12-02"],
        },
      ],
    });
  });

  it("reads slots grouped by site", () => {
    expect(
      parseSvpPrometricSlots([
        {
          site_id: 9,
          slots: [{ id: "slot-1", startDateTime: "2026-12-01T10:00:00", duration: 30 }],
        },
      ]),
    ).toEqual([{ id: "slot-1", siteId: 9, startAt: "2026-12-01T10:00:00", duration: 30 }]);
  });
});

describe("SVP targeted load-balancer sessions", () => {
  it("keeps the string session token and date-only start field", () => {
    const sessions = parseSvpExamSessions({
      exam_sessions: [
        {
          id: "QhHSU5enEg--HeQIKA7MRogPRy6u--Md2sAG6krBtWYeqaM9UXeQ",
          status: "scheduled",
          start_date_in_tc_time_zone: "2026-10-25",
          test_center: { city: "Dhaka", country_id: 78 },
        },
      ],
    });

    expect(sessions).toEqual([
      {
        id: "QhHSU5enEg--HeQIKA7MRogPRy6u--Md2sAG6krBtWYeqaM9UXeQ",
        startAt: "2026-10-25",
        endAt: null,
        duration: 0,
        availableSeats: null,
        city: "Dhaka",
        centerName: null,
        siteId: null,
      },
    ]);
  });
});
