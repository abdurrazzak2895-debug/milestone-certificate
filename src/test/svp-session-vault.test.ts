import { describe, expect, it } from "vitest";
import {
  activeSession,
  createVault,
  isEmptyVault,
  listAccounts,
  parseVault,
  removeAccount,
  setActiveAccount,
  upsertSession,
  type SvpStoredSession,
} from "@/lib/svp-session.vault";

function session(
  login: string,
  savedAt = 1,
  extra: Partial<SvpStoredSession> = {},
): SvpStoredSession {
  return {
    login,
    userName: login.toUpperCase(),
    svpUserId: "969955",
    access: `token-${login}`,
    expiresAt: 1_900_000_000,
    refreshCookies: "",
    savedAt,
    ...extra,
  };
}

describe("SVP multi-account vault", () => {
  it("migrates the previous single-session cookie", () => {
    const vault = parseVault(session("noor@example.com"));

    expect(vault.active).toBe("noor@example.com");
    expect(activeSession(vault)?.access).toBe("token-noor@example.com");
    expect(listAccounts(vault)).toEqual([
      {
        login: "noor@example.com",
        userName: "NOOR@EXAMPLE.COM",
        expiresAt: 1_900_000_000,
        active: true,
      },
    ]);
  });

  it("keeps several accounts, activates the newest, and switches between them", () => {
    let vault = createVault();
    vault = upsertSession(vault, session("first@example.com", 1));
    vault = upsertSession(vault, session("second@example.com", 2));
    vault = upsertSession(vault, session("Third@Example.com", 3));

    expect(Object.keys(vault.sessions)).toHaveLength(3);
    expect(vault.active).toBe("third@example.com");
    expect(listAccounts(vault).map((account) => account.active)).toEqual([true, false, false]);

    vault = setActiveAccount(vault, "FIRST@example.com");
    expect(vault.active).toBe("first@example.com");
    expect(activeSession(vault)?.access).toBe("token-first@example.com");
  });

  it("drops the oldest account beyond the four-account limit", () => {
    let vault = createVault();
    for (const [index, login] of [
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "d@example.com",
      "e@example.com",
    ].entries()) {
      vault = upsertSession(vault, session(login, index + 1));
    }

    const logins = listAccounts(vault).map((account) => account.login);
    expect(logins).toHaveLength(4);
    expect(logins).not.toContain("a@example.com");
    expect(vault.active).toBe("e@example.com");
  });

  it("removing the active account falls back to the next one", () => {
    let vault = upsertSession(createVault(), session("first@example.com", 1));
    vault = upsertSession(vault, session("second@example.com", 2));
    vault = removeAccount(vault, "second@example.com");

    expect(vault.active).toBe("first@example.com");
    expect(activeSession(vault)?.login).toBe("first@example.com");

    vault = removeAccount(vault, "first@example.com");
    expect(isEmptyVault(vault)).toBe(true);
    expect(activeSession(vault)).toBeNull();
  });

  it("ignores malformed cookies and never activates a missing account", () => {
    expect(parseVault(null)).toEqual(createVault());
    expect(parseVault("garbage")).toEqual(createVault());
    expect(parseVault({ active: "missing@example.com", sessions: {} }).active).toBeNull();
    expect(parseVault({ sessions: { a: { login: "a@example.com" } } }).active).toBeNull();
  });

  it("keeps the cookie within size limits by dropping the oldest other account", () => {
    let vault = upsertSession(
      createVault(),
      session("old@example.com", 1, { refreshCookies: "x".repeat(1800) }),
    );
    vault = upsertSession(
      vault,
      session("new@example.com", 2, { refreshCookies: "y".repeat(1800) }),
    );

    expect(Object.keys(vault.sessions)).toEqual(["new@example.com"]);
    expect(vault.active).toBe("new@example.com");
  });
});
