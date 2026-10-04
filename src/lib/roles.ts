export type AppRole = "admin" | "staff" | "agent" | "service_provider" | "management";

/** Pick the landing page for a set of roles. No role = customer portal. */
export function homeForRoles(roles: string[]): "/dashboard" | "/submit-job" | "/provider" | "/management" | "/portal" {
  if (roles.includes("admin") || roles.includes("staff")) return "/dashboard";
  if (roles.includes("agent")) return "/dashboard";
  if (roles.includes("service_provider")) return "/provider";
  if (roles.includes("management")) return "/management";
  return "/portal";
}

export const isManager = (roles: string[]) => roles.includes("admin") || roles.includes("staff");
