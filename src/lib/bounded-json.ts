/**
 * Streaming JSON reader with a hard byte bound, shared by every external-API client
 * (SVP, Takamol, BulkSMS). A gateway that answers with a huge or malformed body must
 * become a normal error instead of buffering megabytes on the server.
 */

/** Default ceiling for an upstream JSON body. */
export const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Release a response body that will not be read. An unconsumed body pins a pooled
 * connection until it is garbage collected.
 */
export async function releaseResponseBody(response: Response): Promise<void> {
  if (!response.body || response.bodyUsed) return;
  try {
    await response.body.cancel();
  } catch {
    // Already consumed, locked, or closed: nothing left to release.
  }
}

/**
 * Read a JSON response body, cancelling the transfer as soon as it crosses `maxBytes`.
 * Empty, oversized, or malformed payloads return null so callers map them to an error.
 */
export async function readBoundedJson(
  response: Response,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let oversized = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        oversized = true;
        break;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    try {
      if (oversized) await reader.cancel();
      reader.releaseLock();
    } catch {
      // The stream is already closed, cancelled, or released.
    }
  }

  if (oversized) return null;

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(bytes);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
