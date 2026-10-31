import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTakamolWithRetry, takamolErrorMessage } from "@/lib/takamol-availability.shared";

function jsonResponse(status: number, body: unknown = { success: true, data: [] }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(502))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { sessions: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchTakamolWithRetry(url, "key", { backoffMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
