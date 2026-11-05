import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTakamolUrl,
  fetchTakamolWithRetry,
  readTakamolJson,
  releaseTakamolBody,
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
    expect(await readTakamolJson(new Response(null, { status: 200 }))).toBeNull();
    const oversized = "x".repeat(TAKAMOL_MAX_BODY_BYTES + 1);
    expect(await readTakamolJson(new Response(oversized, { status: 200 }))).toBeNull();
  });

  it("stops reading and cancels the stream once the byte bound is crossed", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // More than the bound below, and deliberately left open.
        controller.enqueue(new Uint8Array(10).fill(120));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(stream);

    expect(await readTakamolJson(response, 4)).toBeNull();
    expect(cancelled).toBe(true);
    // The body was released, so it cannot be read again.
    expect(response.bodyUsed).toBe(true);
  });

  it("counts bytes, not UTF-16 code units, against the bound", async () => {
    // `"ééé"` is 5 code units but 8 bytes (2-byte characters plus quotes).
    const payload = JSON.stringify("ééé");
    expect(payload.length).toBe(5);
    expect(await readTakamolJson(new Response(payload), 7)).toBeNull();
    expect(await readTakamolJson(new Response(payload), 8)).toBe("ééé");
  });

  it("releases a body that is not read without throwing on a consumed body", async () => {
    const response = jsonResponse(422, { message: "bad request" });
    const cancelSpy = vi.spyOn(response.body!, "cancel");
    await releaseTakamolBody(response);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    // Cancelling twice (or an already-consumed body) is a no-op, never a throw.
    await expect(releaseTakamolBody(response)).resolves.toBeUndefined();
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
    // fetch returns a fresh Response per attempt, each with its own body.
    const responses: Response[] = [];
    const fetchMock = vi.fn(() => {
      const response = jsonResponse(529);
      responses.push(response);
      return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchTakamolWithRetry(url, "key", { backoffMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    const response = await pending;

    expect(response.status).toBe(529);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Every attempt is released, including the final one only inspected for status.
    expect(responses).toHaveLength(3);
    expect(responses.every((attempt) => attempt.bodyUsed)).toBe(true);
    expect(takamolErrorMessage(529)).toContain("overloaded");
  });

  it("leaves the successful response body unread for the caller", async () => {
    const ok = jsonResponse(200, { success: true, data: { sessions: [] } });
    const cancelSpy = vi.spyOn(ok.body!, "cancel");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok));

    const response = await fetchTakamolWithRetry(url, "key", { backoffMs: 100 });

    expect(cancelSpy).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
    expect(await readTakamolJson(response)).toEqual({ success: true, data: { sessions: [] } });
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
