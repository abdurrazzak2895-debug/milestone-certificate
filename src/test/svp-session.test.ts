import { describe, expect, it } from "vitest";
import { buildSvpLoginBody, buildSvpOtpBody, summarizeSvpResponse } from "@/lib/svp-session.shared";

const system = { feApp: "legislator", otpMethod: "email" };

describe("SVP session request contracts", () => {
  it("maps username/password to the exact login body with system fields", () => {
    expect(buildSvpLoginBody({ login: "login-value", password: "password-value" }, system)).toEqual(
      {
        user: {
          fe_app: "legislator",
          login: "login-value",
          otp_method: "email",
          password: "password-value",
        },
      },
    );
  });

  it("maps the OTP attempt to the exact collection body", () => {
    expect(
      buildSvpOtpBody(
        { login: "login-value", password: "password-value", otpAttempt: "otp-value" },
        system,
      ),
    ).toEqual({
      user: {
        fe_app: "legislator",
        login: "login-value",
        otp_attempt: "otp-value",
        otp_method: "email",
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

  it("does not parse or reveal oversized provider bodies", async () => {
    const response = new Response("x".repeat(65 * 1024), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    expect(await summarizeSvpResponse(response)).toEqual({
      httpStatus: 200,
      ok: true,
      contentType: "application/json",
      responseKind: "unknown",
      topLevelFieldNames: [],
    });
  });
});
