// Pure helpers for the multi-account SVP token vault kept in one httpOnly cookie.
export type SvpStoredSession = {
  login: string;
  userName: string | null;
  svpUserId: string | null;
  access: string;
  /** Epoch seconds when the bearer token expires. */
  expiresAt: number;
  refreshCookies: string;
  savedAt: number;
};

export type SvpSessionVault = {
  version: 2;
  active: string | null;
  sessions: Record<string, SvpStoredSession>;
};

export type SvpAccountSummary = {
  login: string;
  userName: string | null;
  expiresAt: number;
  active: boolean;
};

export const MAX_SVP_ACCOUNTS = 4;
const MAX_COOKIE_LENGTH = 3800;

export function accountKey(login: string): string {
  return login.trim().toLowerCase();
}

export function createVault(): SvpSessionVault {
  return { version: 2, active: null, sessions: {} };
}

function text(value: unknown, max = 254): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeSession(value: unknown): SvpStoredSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const login = text(record["login"]);
  const access = text(record["access"], 4096);
  if (!login || !access) return null;
  return {
    login,
    userName: text(record["userName"], 120),
    svpUserId: text(record["svpUserId"], 40),
    access,
    expiresAt: number(record["expiresAt"]) ?? 0,
    refreshCookies:
      typeof record["refreshCookies"] === "string" ? record["refreshCookies"].slice(0, 1200) : "",
    savedAt: number(record["savedAt"]) ?? Date.now(),
  };
}

/** Accept the new vault shape and migrate the previous single-session cookie. */
export function parseVault(raw: unknown): SvpSessionVault {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createVault();
  const record = raw as Record<string, unknown>;

  const legacy = sanitizeSession(record);
  if (legacy) {
    const key = accountKey(legacy.login);
    return { version: 2, active: key, sessions: { [key]: legacy } };
  }

  const sessions: Record<string, SvpStoredSession> = {};
  const source = record["sessions"];
  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      const session = sanitizeSession(value);
      if (session) sessions[accountKey(session.login) || key] = session;
    }
  }
  const activeCandidate = typeof record["active"] === "string" ? record["active"] : null;
  const active =
    activeCandidate && sessions[activeCandidate]
      ? activeCandidate
      : (Object.keys(sessions)[0] ?? null);
  return { version: 2, active, sessions };
}

export function activeSession(vault: SvpSessionVault): SvpStoredSession | null {
  return vault.active ? (vault.sessions[vault.active] ?? null) : null;
}

export function listAccounts(vault: SvpSessionVault): SvpAccountSummary[] {
  return Object.entries(vault.sessions)
    .map(([key, session]) => ({
      login: session.login,
      userName: session.userName,
      expiresAt: session.expiresAt,
      active: key === vault.active,
    }))
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (a.userName ?? a.login).localeCompare(b.userName ?? b.login);
    });
}

function fitCookie(vault: SvpSessionVault): SvpSessionVault {
  let next = vault;
  while (Object.keys(next.sessions).length > 1 && JSON.stringify(next).length > MAX_COOKIE_LENGTH) {
    const oldest = Object.entries(next.sessions)
      .filter(([key]) => key !== next.active)
      .sort((a, b) => a[1].savedAt - b[1].savedAt)[0];
    if (!oldest) break;
    const { [oldest[0]]: _removed, ...remaining } = next.sessions;
    next = { ...next, sessions: remaining };
  }
  return next;
}

/** Add or replace one account, make it active, and keep the vault within limits. */
export function upsertSession(vault: SvpSessionVault, session: SvpStoredSession): SvpSessionVault {
  const key = accountKey(session.login);
  let sessions: Record<string, SvpStoredSession> = { ...vault.sessions, [key]: session };

  const keys = Object.keys(sessions);
  if (keys.length > MAX_SVP_ACCOUNTS) {
    const oldest = keys
      .filter((entry) => entry !== key)
      .sort((a, b) => (sessions[a]?.savedAt ?? 0) - (sessions[b]?.savedAt ?? 0))[0];
    if (oldest) {
      const { [oldest]: _removed, ...remaining } = sessions;
      sessions = remaining;
    }
  }

  return fitCookie({ version: 2, active: key, sessions });
}

export function setActiveAccount(vault: SvpSessionVault, login: string): SvpSessionVault {
  const key = accountKey(login);
  if (!vault.sessions[key]) return vault;
  return { ...vault, active: key };
}

export function removeAccount(vault: SvpSessionVault, login: string): SvpSessionVault {
  const key = accountKey(login);
  if (!vault.sessions[key]) return vault;
  const { [key]: _removed, ...sessions } = vault.sessions;
  const active = vault.active === key ? (Object.keys(sessions)[0] ?? null) : vault.active;
  return { version: 2, active, sessions };
}

export function isEmptyVault(vault: SvpSessionVault): boolean {
  return Object.keys(vault.sessions).length === 0;
}
