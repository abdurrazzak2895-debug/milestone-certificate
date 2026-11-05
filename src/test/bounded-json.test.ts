import { describe, expect, it, vi } from "vitest";
import { MAX_JSON_BODY_BYTES, readBoundedJson, releaseResponseBody } from "@/lib/bounded-json";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("bounded JSON helper", () => {
  it("parses a normal body and collapses empty/malformed bodies to null", async () => {
    expect(await readBoundedJson(jsonResponse(200, { ok: true }))).toEqual({ ok: true });
    expect(await readBoundedJson(new Response("", { status: 200 }))).toBeNull();
    expect(await readBoundedJson(new Response("   ", { status: 200 }))).toBeNull();
    expect(await readBoundedJson(new Response("<html>nope", { status: 200 }))).toBeNull();
    expect(await readBoundedJson(new Response(null, { status: 200 }))).toBeNull();
  });

  it("cancels the stream once the byte bound is crossed", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(16).fill(120));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(stream);

    expect(await readBoundedJson(response, 8)).toBeNull();
    expect(cancelled).toBe(true);
    expect(response.bodyUsed).toBe(true);
  });

  it("counts bytes rather than UTF-16 code units", async () => {
    const payload = JSON.stringify("ééé"); // 5 code units, 8 bytes
    expect(payload.length).toBe(5);
    expect(await readBoundedJson(new Response(payload), 7)).toBeNull();
    expect(await readBoundedJson(new Response(payload), 8)).toBe("ééé");
  });

  it("releases a body that will not be read, without throwing twice", async () => {
    const response = jsonResponse(502, { message: "bad gateway" });
    const cancelSpy = vi.spyOn(response.body!, "cancel");
    await releaseResponseBody(response);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    await expect(releaseResponseBody(response)).resolves.toBeUndefined();
  });

  it("keeps a sane default ceiling", () => {
    expect(MAX_JSON_BODY_BYTES).toBe(2 * 1024 * 1024);
  });
});
