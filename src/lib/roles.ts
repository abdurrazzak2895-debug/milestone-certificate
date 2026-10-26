export type AppRole = "admin" | "staff" | "agent" | "service_provider" | "management";

export const AGENT_PATHS = [
  "/dashboard",
  "/submit-job",
  "/my-works",
  "/sub-agents",
  "/office",
  "/about",
  "/agent-results",
  "/svp-booking",
  "/wallet",
] as const;
export const PROVIDER_PATHS = ["/provider"] as const;
export const ADMIN_ONLY_PATHS = [
  "/finance",
  "/agency-report",
  "/messages",
  "/center-addresses",
] as const;
export const MANAGEMENT_PATHS = ["/management", "/submissions"] as const;

/** Pick the landing page for a set of roles. No role = customer portal. */
export function homeForRoles(
  roles: string[],
): "/dashboard" | "/submit-job" | "/provider" | "/management" | "/portal" {
  if (roles.includes("admin") || roles.includes("staff")) return "/dashboard";
  if (roles.includes("agent")) return "/dashboard";
  if (roles.includes("service_provider")) return "/provider";
  if (roles.includes("management")) return "/management";
  return "/portal";
}

export const isManager = (roles: string[]) => roles.includes("admin") || roles.includes("staff");

/**
 * Check the same role/path rules used by the authenticated route guard.
 * Managers can use the common management pages; only admins can use admin-only pages.
 */
export function canAccessPath(path: string, roles: string[]): boolean {
  if (ADMIN_ONLY_PATHS.includes(path as (typeof ADMIN_ONLY_PATHS)[number])) {
    return roles.includes("admin");
  }
  if (isManager(roles)) return true;

  const allowed = [
    ...(roles.includes("agent") ? AGENT_PATHS : []),
    ...(roles.includes("service_provider") ? PROVIDER_PATHS : []),
    ...(roles.includes("management") ? MANAGEMENT_PATHS : []),
  ];
  return allowed.includes(path as (typeof allowed)[number]);
}
