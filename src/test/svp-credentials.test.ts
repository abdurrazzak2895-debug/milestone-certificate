import { describe, expect, it, vi } from "vitest";
import { decryptSvpPassword, encryptSvpPassword } from "@/lib/svp-credentials.server";

describe("SVP saved credentials", () => {
  it("round-trips the password with AES-GCM and rejects tampering", async () => {
    vi.stubEnv("SVP_CREDENTIAL_KEY", "test-credential-secret");
    const cipher = await encryptSvpPassword("Svp-password-123");
    expect(cipher).toMatch(/^v1\./);
    expect(cipher).not.toContain("Svp-password-123");
    await expect(decryptSvpPassword(cipher)).resolves.toBe("Svp-password-123");
    await expect(decryptSvpPassword(`${cipher}x`)).resolves.toBeNull();
    vi.unstubAllEnvs();
  });

  it("does not store a password when no server secret is configured", async () => {
    vi.stubEnv("SVP_CREDENTIAL_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(encryptSvpPassword("secret")).resolves.toBeNull();
    vi.unstubAllEnvs();
  });
});
