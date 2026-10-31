import { describe, expect, it } from "vitest";
import {
  parseAvailableDates,
  parseCities,
  mapTakamolRowsToSvpSlots,
  parseOccupationLanguages,
  parseOccupations,
  parseTakamolRescheduleRows,
  parseSessionTableRows,
  parseSessions,
  parseTestCenters,
  redactTakamolPayload,
} from "@/lib/takamol-availability.ui";

describe("Takamol selection data", () => {
  it("maps occupations to unique category-backed choices", () => {
    expect(
      parseOccupations({
        occupations: [
          { id: 50, occupation_id: 2008, category_name: "Barber", english_name: "Barber" },
          { id: 50, occupation_id: 2009, category_name: "Barber", english_name: "Hair worker" },
          { id: null, english_name: "Missing category" },
        ],
      }),
    ).toEqual([
      { optionId: "2008", categoryId: "50", label: "Barber", category: null },
      { optionId: "2009", categoryId: "50", label: "Hair worker", category: "Barber" },
    ]);
  });

  it("keeps the languages and language code reported by Takamol", () => {
    const [occupation] = parseOccupations({
      occupations: [
        {
          id: 50,
          occupation_id: 2008,
          english_name: "Barber",
          languages: ["Bengali", { name: "English" }],
          language_code: "BRBBB",
        },
      ],
    });

    expect(occupation?.languages).toEqual(["Bengali", "English"]);
    expect(occupation?.languageCode).toBe("BRBBB");
    expect(
      parseOccupationLanguages({
        occupations: [
          { id: 50, occupation_id: 2008, language_code: "BRBBB" },
          { id: 49, occupation_id: 2009, language_code: "" },
        ],
      }),
    ).toEqual([{ occupationId: "2008", occupationKey: null, languageCode: "BRBBB" }]);
  });

  it("normalizes and deduplicates city options", () => {
    expect(parseCities({ cities: ["Dhaka", " dhaka ", { name: "Rajshahi" }, null] })).toEqual([
      "Dhaka",
      "Rajshahi",
    ]);
  });

  it("collects unique valid dates from normalized and provider date arrays", () => {
    expect(
      parseAvailableDates({
        dates: [{ date: "2026-10-25" }, { test_center_date: "2026-10-26" }],
        available_dates: [
          { start_date_in_browser_time_zone: "2026-10-25" },
          { start_date_in_tc_time_zone: "2026-02-31" },
        ],
      }),
    ).toEqual(["2026-10-25", "2026-10-26"]);
  });

  it("extracts test-center display fields without retaining opaque tokens", () => {
    expect(
      parseTestCenters({
        sites: [
          {
            id: "403",
            center_token: "private-center-token",
            name: "Arkan Training Center",
            city: "Dhaka Arkan",
          },
        ],
      }),
    ).toEqual([{ id: "403", label: "Arkan Training Center", location: "Dhaka Arkan" }]);
  });

  it("accepts common center_id and test_center_name aliases", () => {
    expect(
      parseTestCenters({
        test_centers: [
          { center_id: 17, test_center_name: "Bogura TTC", location: "Bogura" },
          { site_id: "18", site_name: "Rajshahi TTC", city: "Rajshahi" },
        ],
      }),
    ).toEqual([
      { id: "17", label: "Bogura TTC", location: "Bogura" },
      { id: "18", label: "Rajshahi TTC", location: "Rajshahi" },
    ]);
  });

  it("maps provider sessions to the Center Name, Exam Slot, Exam Time, and Seats columns", () => {
    expect(
      parseSessionTableRows({
        sessions: [
          {
            id: "slot-1",
            center_name: "Rajshahi",
            exam_slot: "available",
            exam_time: "10:00 AM",
            seats: 9,
            language_name: "Bengali",
          },
          {
            session_id: "slot-2",
            center_name: "Dhaka",
            status: "Full",
            start_time: "11:30 AM",
            available_seats: 0,
            language_code: "en",
          },
        ],
      }),
    ).toEqual([
      {
        id: "slot-1",
        centerName: "Rajshahi",
        examSlot: "Available",
        examTime: "10:00 AM",
        seats: "9",
        language: "Bengali",
      },
      {
        id: "slot-2",
        centerName: "Dhaka",
        examSlot: "Full",
        examTime: "11:30 AM",
        seats: "0",
        language: "English",
      },
    ]);
  });

  it("uses a test-center label for nested sessions and the selected city as fallback", () => {
    expect(
      parseSessionTableRows(
        {
          sites: [
            {
              name: "Rajshahi",
              sessions: [{ id: "nested-slot", status: "Available", time: "10:00 AM", seats: 9 }],
            },
          ],
        },
        "Selected city",
      ),
    ).toEqual([
      {
        id: "nested-slot",
        centerName: "Rajshahi",
        examSlot: "Available",
        examTime: "10:00 AM",
        seats: "9",
        language: null,
      },
    ]);
    expect(
      parseSessionTableRows({ sessions: [{ id: "fallback", status: "Available" }] }, "Rajshahi")[0]
        ?.centerName,
    ).toBe("Rajshahi");
  });

  it("maps Takamol rows to SVP slots by exact center, date, and normalized time rather than order", () => {
    const centers = [
      { id: "center-a", label: "Site A", location: "Dhaka" },
      { id: "center-b", label: "Site B", location: "Dhaka" },
    ];
    const rows = parseTakamolRescheduleRows(
      {
        sessions: [
          {
            id: "tak-a",
            test_center_id: "center-a",
            exam_date: "2026-12-01",
            exam_time: "10:00 AM",
            status: "Available",
            available_seats: 3,
          },
          {
            id: "tak-b",
            test_center_id: "center-b",
            exam_date: "2026-12-01",
            exam_time: "11:00",
            status: "Available",
            available_seats: 2,
          },
        ],
      },
      centers,
      "Dhaka",
      "2026-12-01",
    );
    const mappings = mapTakamolRowsToSvpSlots(
      rows,
      [
        { siteId: 9, name: "Site A", city: "Dhaka" },
        { siteId: 10, name: "Site B", city: "Dhaka" },
      ],
      [
        { id: "slot-b", siteId: 10, startAt: "2026-12-01T11:00:00", duration: 30 },
        { id: "slot-a", siteId: 9, startAt: "2026-12-01T10:00:00", duration: 30 },
      ],
      "Dhaka",
      "2026-12-01",
    );

    expect(mappings.map((entry) => entry.slot?.id)).toEqual(["slot-a", "slot-b"]);
  });

  it("rejects ambiguous and unmatched Takamol rows instead of choosing an arbitrary SVP slot", () => {
    const rows = parseTakamolRescheduleRows(
      {
        sessions: [
          {
            id: "tak-ambiguous",
            center_name: "Site A",
            city: "Dhaka",
            exam_date: "2026-12-01",
            exam_time: "10:00 AM",
            status: "Available",
          },
          {
            id: "tak-missing",
            center_name: "Unknown Center",
            city: "Dhaka",
            exam_date: "2026-12-01",
            exam_time: "12:00 PM",
            status: "Available",
          },
        ],
      },
      [],
      "Dhaka",
      "2026-12-01",
    );
    const mappings = mapTakamolRowsToSvpSlots(
      rows,
      [{ siteId: 9, name: "Site A", city: "Dhaka" }],
      [
        { id: "slot-a1", siteId: 9, startAt: "2026-12-01T10:00:00", duration: 30 },
        { id: "slot-a2", siteId: 9, startAt: "2026-12-01T10:00:00", duration: 30 },
      ],
      "Dhaka",
      "2026-12-01",
    );

    expect(mappings.map((entry) => entry.reason)).toEqual(["ambiguous", "no-match"]);
    expect(mappings.every((entry) => entry.slot === null)).toBe(true);
  });

  it("reads session records and recursively removes private provider fields", () => {
    const payload = {
      sessions: [{ id: 4, exam_time: "09:00", nested: { center_token: "private", seats: 2 } }],
    };
    expect(parseSessions(payload)).toEqual(payload.sessions);
    expect(redactTakamolPayload(payload)).toEqual({
      sessions: [{ id: 4, exam_time: "09:00", nested: { seats: 2 } }],
    });
    expect(parseSessions({ sessions: [], exam_sessions: [] })).toEqual([]);
  });
});
