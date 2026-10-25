import { describe, expect, it } from "vitest";
import {
  buildSvpLoginBody,
  buildSvpOtpBody,
  extractSvpAuthPayload,
  extractSvpSessionUser,
  readSvpSessionResult,
} from "@/lib/svp-session.shared";

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

describe("SVP login outcomes", () => {
  it("requires the OTP when the login request is accepted", async () => {
    const response = new Response(JSON.stringify({ message: "OTP sent" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const result = await readSvpSessionResult(response, "login", ["login-value", "password-value"]);

    expect(result).toEqual({
      step: "login",
      httpStatus: 200,
      ok: true,
      otpRequired: true,
      authenticated: false,
      message: "OTP sent",
      session: null,
    });
  });

  it("reports a rejected login without echoing the credentials", async () => {
    const response = new Response(
      JSON.stringify({ errors: { login: ["Wrong password-value for login-value"] } }),
      { status: 422, headers: { "content-type": "application/json" } },
    );

    const result = await readSvpSessionResult(response, "login", ["login-value", "password-value"]);

    expect(result.ok).toBe(false);
    expect(result.otpRequired).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.message).toContain("[redacted]");
    expect(result.message).not.toContain("password-value");
    expect(result.message).not.toContain("login-value");
  });

  it("confirms the OTP but never returns the session token", async () => {
    const response = new Response(
      JSON.stringify({ access_token: "SECRET_TOKEN_VALUE", user: { id: 969955 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

    const result = await readSvpSessionResult(response, "otp", ["password-value"]);

    expect(result.authenticated).toBe(true);
    expect(result.otpRequired).toBe(false);
    expect(result.message).toBe("Signed in to SVP.");
    expect(JSON.stringify(result)).not.toContain("SECRET_TOKEN_VALUE");
  });

  it("falls back to a safe provider message when the body is empty", async () => {
    const result = await readSvpSessionResult(new Response("", { status: 503 }), "otp");

    expect(result.ok).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.message).toMatch(/not responding/i);
  });

  it("strips HTML from provider messages", async () => {
    const response = new Response(JSON.stringify({ error: "<b>Invalid</b> <i>OTP</i>" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });

    const result = await readSvpSessionResult(response, "otp");

    expect(result.message).toBe("Invalid OTP");
  });
});

describe("SVP token extraction", () => {
  it("trims the token and treats a small access_expires_at as a duration", () => {
    const before = Math.floor(Date.now() / 1000);
    const auth = extractSvpAuthPayload({
      access_payload: { access: "  TOKEN-VALUE  ", access_expires_at: 3600 },
    });

    expect(auth?.access).toBe("TOKEN-VALUE");
    expect(auth?.accessExpiresAt).toBeGreaterThanOrEqual(before + 3595);
    expect(auth?.accessExpiresAt).toBeLessThanOrEqual(before + 3605);
  });

  it("keeps epoch seconds and milliseconds correct", () => {
    expect(
      extractSvpAuthPayload({ access: "A", access_expires_at: 1_800_000_000 })?.accessExpiresAt,
    ).toBe(1_800_000_000);
    expect(
      extractSvpAuthPayload({ access: "A", access_expires_at: 1_800_000_000_000 })?.accessExpiresAt,
    ).toBe(1_800_000_000);
  });
});

describe("SVP passport identity extraction", () => {
  it("normalizes an explicitly named passport from the user or profile", () => {
    expect(
      extractSvpSessionUser({
        user: {
          id: "user-id",
          passport_number: "  ab12345 ",
          profile: { passport_no: "profile999" },
        },
      }).passport,
    ).toBe("AB12345");

    expect(
      extractSvpSessionUser({
        user: { profile: { passport: "xy98765" } },
      }).passport,
    ).toBe("XY98765");
  });

  it("rejects invalid or generic identity values", () => {
    expect(
      extractSvpSessionUser({
        user: {
          id: "969955",
          token: "TOKEN12345",
          passport_number: "too-short",
          passport_no: "A-12345",
        },
      }).passport,
    ).toBeNull();
  });
});
