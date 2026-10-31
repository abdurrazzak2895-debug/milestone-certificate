import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTakamolUrl,
  fetchTakamolWithRetry,
  readTakamolJson,
  takamolErrorMessage,
  unwrapTakamolResponse,
  TAKAMOL_MAX_BODY_BYTES,
  type TakamolLookupRequest,
} from "@/lib/takamol-availability.shared";

function jsonResponse(status: number, body: unknown = { success: true, data: [] }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Takamol API request URLs", () => {
  const base = "https://choice-pc-sv.xyz/api/external/takamol-availability/v1";

  function urlOf(request: TakamolLookupRequest): URLSearchParams {
    const url = buildTakamolUrl(request);
    expect(url.origin + url.pathname).toBe(`${base}/${request.endpoint}`);
    return url.searchParams;
  }

  it("builds each endpoint with the documented query parameters", () => {
    expect(urlOf({ endpoint: "occupations" }).toString()).toBe("");
    expect(urlOf({ endpoint: "occupations", search: "weld" }).get("search")).toBe("weld");
    expect(urlOf({ endpoint: "cities", categoryId: "159" }).get("category_id")).toBe("159");
    expect(urlOf({ endpoint: "dates", categoryId: "159", city: "Dhaka" }).toString()).toBe(
      "category_id=159&city=Dhaka",
    );
    expect(urlOf({ endpoint: "centers" }).toString()).toBe("");
    expect(urlOf({ endpoint: "centers", city: "Dhaka Arkan" }).get("city")).toBe("Dhaka Arkan");
    expect(
      urlOf({
        endpoint: "sessions",
        categoryId: "159",
        city: "Dhaka",
        examDate: "2026-12-01",
      }).toString(),
    ).toBe("category_id=159&city=Dhaka&exam_date=2026-12-01");
    expect(
      urlOf({
        endpoint: "sessions",
        categoryId: "159",
        city: "Dhaka",
        examDate: "2026-12-01",
        testCenterId: "403",
      }).get("test_center_id"),
    ).toBe("403");
  });

  it("URL-encodes non-ASCII city and search values", () => {
    const url = buildTakamolUrl({ endpoint: "dates", categoryId: "1", city: "দুবাই" });
    expect(url.searchParams.get("city")).toBe("দুবাই");
    expect(url.href).toContain(encodeURIComponent("দুবাই"));
  });
});

describe("Takamol response unwrapping", () => {
  it("accepts only { success: true, data } envelopes with JSON-safe data", () => {
    expect(unwrapTakamolResponse({ success: true, data: { cities: ["Dhaka"] } })).toEqual({
      success: true,
      data: { cities: ["Dhaka"] },
    });
    expect(unwrapTakamolResponse({ success: false, message: "no" })).toBeNull();
    expect(unwrapTakamolResponse({ success: true })).toBeNull();
    expect(unwrapTakamolResponse(null)).toBeNull();
    expect(unwrapTakamolResponse([1, 2])).toBeNull();
    expect(unwrapTakamolResponse({ success: true, data: { bad: () => 1 } })).toBeNull();
    expect(unwrapTakamolResponse({ success: true, data: NaN })).toBeNull();
  });

  it("reads bounded JSON and collapses oversized or malformed bodies to null", async () => {
    expect(await readTakamolJson(jsonResponse(200, { success: true, data: [] }))).toEqual({
      success: true,
      data: [],
    });
    expect(await readTakamolJson(new Response("", { status: 200 }))).toBeNull();
    expect(await readTakamolJson(new Response("not json", { status: 200 }))).toBeNull();
    const oversized = "x".repeat(TAKAMOL_MAX_BODY_BYTES + 1);
    expect(await readTakamolJson(new Response(oversized, { status: 200 }))).toBeNull();
  });
});

describe("Takamol availability fetch retry", () => {
  const url = new URL("https://choice-pc-sv.xyz/api/external/takamol-availability/v1/sessions");

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries transient gateway failures and returns the successful response", async () => {
    const rateLimited = jsonResponse(429, { message: "slow down" });
    const cancelSpy = vi.spyOn(rateLimited.body!, "cancel");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(jsonResponse(502))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { sessions: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchTakamolWithRetry(url, "key", { backoffMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The failed response body is released so its connection is not pinned.
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(url);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toMatchObject({
        method: "GET",
        headers: { "X-Takamol-API-Key": "key", Accept: "application/json" },
        cache: "no-store",
      });
    }
  });

  it("returns the last transient response after the retry budget is exhausted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(529));
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchTakamolWithRetry(url, "key", { backoffMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    const response = await pending;

    expect(response.status).toBe(529);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(takamolErrorMessage(529)).toContain("overloaded");
  });

  it("does not retry non-transient statuses", async () => {
    for (const status of [401, 403, 422]) {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(status));
      vi.stubGlobal("fetch", fetchMock);
      const response = await fetchTakamolWithRetry(url, "key", { backoffMs: 100 });
      expect(response.status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("maps network failures through the caller's catch path without retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTakamolWithRetry(url, "key", { backoffMs: 100 })).rejects.toThrow(
      "fetch failed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
