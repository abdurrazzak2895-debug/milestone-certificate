import { describe, expect, it } from "vitest";
import { buildSvpLoginBody, buildSvpOtpBody, summarizeSvpResponse } from "@/lib/svp-session.shared";

describe("SVP session draft request contracts", () => {
  it("maps login inputs to the exact collection body fields", () => {
    expect(
      buildSvpLoginBody({
        login: "login-value",
        password: "password-value",
        feApp: "fe-app-value",
        otpMethod: "otp-method-value",
        locale: "locale-value",
      }),
    ).toEqual({
      user: {
        fe_app: "fe-app-value",
        login: "login-value",
        otp_method: "otp-method-value",
        password: "password-value",
      },
    });
  });

  it("maps OTP inputs to the exact collection body fields", () => {
    expect(
      buildSvpOtpBody({
        login: "login-value",
        password: "password-value",
        feApp: "fe-app-value",
        otpMethod: "otp-method-value",
        locale: "locale-value",
        otpAttempt: "otp-attempt-value",
      }),
    ).toEqual({
      user: {
        fe_app: "fe-app-value",
        login: "login-value",
        otp_attempt: "otp-attempt-value",
        otp_method: "otp-method-value",
        password: "password-value",
      },
    });
  });
});

describe("SVP response sanitization", () => {
  it("keeps only metadata and top-level field names, never response values", async () => {
    const response = new Response(
      JSON.stringify({
        access_token: "SECRET_TOKEN_VALUE",
        user: { password: "SECRET_PASSWORD_VALUE" },
        message: "SECRET_MESSAGE_VALUE",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
    );

    const summary = await summarizeSvpResponse(response);

    expect(summary).toEqual({
      httpStatus: 200,
      ok: true,
      contentType: "application/json",
      responseKind: "json-object",
      topLevelFieldNames: ["access_token", "user", "message"],
    });
    expect(JSON.stringify(summary)).not.toContain("SECRET_TOKEN_VALUE");
    expect(JSON.stringify(summary)).not.toContain("SECRET_PASSWORD_VALUE");
    expect(JSON.stringify(summary)).not.toContain("SECRET_MESSAGE_VALUE");
  });

  it("summarizes non-JSON bodies without exposing their contents", async () => {
    const response = new Response("SECRET_HTML_BODY", {
      status: 502,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const summary = await summarizeSvpResponse(response);

    expect(summary).toEqual({
      httpStatus: 502,
      ok: false,
      contentType: "text/html",
      responseKind: "text",
      topLevelFieldNames: [],
    });
    expect(JSON.stringify(summary)).not.toContain("SECRET_HTML_BODY");
  });

  it("does not parse response bodies larger than the safety cap", async () => {
    const response = new Response("x".repeat(64 * 1024 + 1), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(summarizeSvpResponse(response)).resolves.toEqual({
      httpStatus: 200,
      ok: true,
      contentType: "application/json",
      responseKind: "unknown",
      topLevelFieldNames: [],
    });
  });
});
