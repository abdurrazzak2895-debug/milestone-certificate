import { z } from "zod";

export const svpLoginInputSchema = z.object({
  login: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(512),
});

export const svpOtpInputSchema = svpLoginInputSchema.extend({
  otpAttempt: z.string().trim().min(1).max(128),
});

export const svpSessionDraftInputSchema = z.discriminatedUnion("step", [
  svpLoginInputSchema.extend({ step: z.literal("login") }),
  svpOtpInputSchema.extend({ step: z.literal("otp") }),
]);

export type SvpLoginInput = z.infer<typeof svpLoginInputSchema>;
export type SvpOtpInput = z.infer<typeof svpOtpInputSchema>;
export type SvpSessionDraftInput = z.infer<typeof svpSessionDraftInputSchema>;

export type SvpSystemConfig = {
  feApp: string;
  otpMethod: string;
};

export type SvpLoginBody = {
  user: {
    fe_app: string;
    login: string;
    otp_method: string;
    password: string;
  };
};

export type SvpOtpBody = {
  user: {
    fe_app: string;
    login: string;
    otp_attempt: string;
    otp_method: string;
    password: string;
  };
};

export function buildSvpLoginBody(input: SvpLoginInput, system: SvpSystemConfig): SvpLoginBody {
  return {
    user: {
      fe_app: system.feApp,
      login: input.login,
      otp_method: system.otpMethod,
      password: input.password,
    },
  };
}

export function buildSvpOtpBody(input: SvpOtpInput, system: SvpSystemConfig): SvpOtpBody {
  return {
    user: {
      fe_app: system.feApp,
      login: input.login,
      otp_attempt: input.otpAttempt,
      otp_method: system.otpMethod,
      password: input.password,
    },
  };
}

export type SvpResponseKind =
  "empty" | "json-object" | "json-array" | "json-primitive" | "text" | "unknown";

export type SvpResponseSummary = {
  httpStatus: number;
  ok: boolean;
  contentType: string | null;
  responseKind: SvpResponseKind;
  topLevelFieldNames: string[];
};

const MAX_FIELD_NAMES = 50;
const MAX_FIELD_NAME_LENGTH = 80;
const MAX_RESPONSE_BODY_BYTES = 64 * 1024;

function safeContentType(response: Response): string | null {
  const raw = response.headers.get("content-type");
  if (!raw) return null;
  const mimeType = raw.split(";", 1)[0]?.trim().toLowerCase();
  return mimeType ? mimeType.slice(0, 128) : null;
}

async function readBoundedResponseBody(response: Response): Promise<string | null> {
  const stream = response.body;
  if (!stream) {
    const body = await response.text();
    return new TextEncoder().encode(body).byteLength <= MAX_RESPONSE_BODY_BYTES ? body : null;
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
}

export async function summarizeSvpResponse(response: Response): Promise<SvpResponseSummary> {
  const summary: SvpResponseSummary = {
    httpStatus: response.status,
    ok: response.ok,
    contentType: safeContentType(response),
    responseKind: "unknown",
    topLevelFieldNames: [],
  };

  let body: string;
  try {
    const boundedBody = await readBoundedResponseBody(response);
    if (boundedBody === null) return summary;
    body = boundedBody;
  } catch {
    return summary;
  }

  const trimmed = body.trim();
  if (!trimmed) {
    summary.responseKind = "empty";
    return summary;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      summary.responseKind = "json-array";
      return summary;
    }
    if (parsed !== null && typeof parsed === "object") {
      summary.responseKind = "json-object";
      summary.topLevelFieldNames = Object.keys(parsed)
        .slice(0, MAX_FIELD_NAMES)
        .map((fieldName) => fieldName.slice(0, MAX_FIELD_NAME_LENGTH));
      return summary;
    }
    summary.responseKind = "json-primitive";
    return summary;
  } catch {
    summary.responseKind = summary.contentType?.includes("json") ? "unknown" : "text";
    return summary;
  }
}
