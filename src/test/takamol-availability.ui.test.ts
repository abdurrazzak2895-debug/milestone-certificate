import { describe, expect, it } from "vitest";
import {
  parseAvailableDates,
  parseCities,
  parseOccupations,
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
