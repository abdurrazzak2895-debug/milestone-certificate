import { describe, expect, it } from "vitest";
import {
  buildTakamolUrl,
  takamolErrorMessage,
  takamolLookupSchema,
  unwrapTakamolResponse,
} from "@/lib/takamol-availability.shared";

describe("Takamol availability request mapping", () => {
  it("builds an encoded occupation search URL", () => {
    const request = takamolLookupSchema.parse({
      endpoint: "occupations",
      search: "care worker & helper",
    });
    const url = buildTakamolUrl(request);

    expect(url.origin).toBe("https://choice-pc-sv.xyz");
    expect(url.pathname).toBe("/api/external/takamol-availability/v1/occupations");
    expect(url.searchParams.get("search")).toBe("care worker & helper");
  });

  it("maps category IDs to the cities query", () => {
    const request = takamolLookupSchema.parse({ endpoint: "cities", categoryId: " 50 " });
    const url = buildTakamolUrl(request);

    expect(url.pathname.endsWith("/cities")).toBe(true);
    expect(url.searchParams.get("category_id")).toBe("50");
  });

  it("requires category and city for dates", () => {
    const request = takamolLookupSchema.parse({
      endpoint: "dates",
      categoryId: "50",
      city: "Dhaka",
    });
    const url = buildTakamolUrl(request);

    expect(url.pathname.endsWith("/dates")).toBe(true);
    expect(url.searchParams.get("category_id")).toBe("50");
    expect(url.searchParams.get("city")).toBe("Dhaka");
    expect(() => takamolLookupSchema.parse({ endpoint: "dates", categoryId: "50" })).toThrow();
  });

  it("allows all centers or narrows by city", () => {
    const allCenters = buildTakamolUrl(takamolLookupSchema.parse({ endpoint: "centers" }));
    const cityCenters = buildTakamolUrl(
      takamolLookupSchema.parse({ endpoint: "centers", city: "Dhaka" }),
    );

    expect(allCenters.pathname.endsWith("/centers")).toBe(true);
    expect(allCenters.search).toBe("");
    expect(cityCenters.searchParams.get("city")).toBe("Dhaka");
  });

  it("maps sessions and optional test center to the documented parameter names", () => {
    const request = takamolLookupSchema.parse({
      endpoint: "sessions",
      categoryId: "50",
      city: "Dhaka",
      examDate: "2026-10-24",
      testCenterId: "center/12",
    });
    const url = buildTakamolUrl(request);

    expect(url.pathname.endsWith("/sessions")).toBe(true);
    expect(url.searchParams.get("category_id")).toBe("50");
    expect(url.searchParams.get("city")).toBe("Dhaka");
    expect(url.searchParams.get("exam_date")).toBe("2026-10-24");
    expect(url.searchParams.get("test_center_id")).toBe("center/12");
  });

  it("rejects invalid calendar dates", () => {
    expect(() =>
      takamolLookupSchema.parse({
        endpoint: "sessions",
        categoryId: "50",
        city: "Dhaka",
        examDate: "2026-02-31",
      }),
    ).toThrow();
  });
});

describe("Takamol response handling", () => {
  it("unwraps only successful gateway envelopes", () => {
    expect(unwrapTakamolResponse({ success: true, data: [{ id: 1 }] })).toEqual({
      success: true,
      data: [{ id: 1 }],
    });
    expect(unwrapTakamolResponse({ success: false, data: [] })).toBeNull();
    expect(unwrapTakamolResponse({ success: true })).toBeNull();
    expect(unwrapTakamolResponse(null)).toBeNull();
  });

  it("rejects successful envelopes with non-JSON data", () => {
    expect(unwrapTakamolResponse({ success: true, data: { missing: undefined } })).toBeNull();
    expect(unwrapTakamolResponse({ success: true, data: new Date() })).toBeNull();
  });

  it("maps documented HTTP errors without exposing upstream bodies", () => {
    expect(takamolErrorMessage(401)).toContain("API key");
    expect(takamolErrorMessage(422)).toContain("query parameters");
    expect(takamolErrorMessage(429)).toContain("rate limit");
    expect(takamolErrorMessage(502)).toContain("temporarily unavailable");
  });
});
