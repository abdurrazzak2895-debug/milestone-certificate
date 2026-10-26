import { describe, expect, it } from "vitest";

import { navigationForRoles } from "@/lib/navigation";
import { canAccessPath } from "@/lib/roles";

const pathsFor = (roles: string[]) => navigationForRoles(roles).map((item) => item.to);

describe("role-based navigation", () => {
  it("puts SVP booking first for agents and keeps it out of the admin menu", () => {
    const agentPaths = pathsFor(["agent"]);
    expect(agentPaths[0]).toBe("/svp-booking");
    expect(agentPaths).toContain("/dashboard");
    expect(agentPaths).not.toContain("/takamol");

    for (const roles of [["admin"], ["staff"]]) {
      const paths = pathsFor(roles);
      expect(paths).not.toContain("/svp-booking");
      expect(paths).toContain("/dashboard");
    }
  });

  it("keeps manager navigation precedence for mixed admin and agent roles", () => {
    const paths = pathsFor(["admin", "agent"]);

    expect(paths).not.toContain("/svp-booking");
    expect(paths).not.toContain("/takamol");
    expect(paths).toContain("/finance");
    expect(paths).not.toContain("/submit-job");
  });

  it("keeps agent navigation while excluding admin-only navigation", () => {
    const paths = pathsFor(["agent"]);

    expect(paths[0]).toBe("/svp-booking");
    expect(paths).toContain("/dashboard");
    expect(paths).toContain("/submit-job");
    expect(paths).toContain("/my-works");
    expect(paths).not.toContain("/takamol");
    expect(paths).not.toContain("/finance");
  });

  it("does not expose booking navigation to provider or management-only roles", () => {
    for (const roles of [["service_provider"], ["management"]]) {
      const paths = pathsFor(roles);
      expect(paths).not.toContain("/svp-booking");
      expect(paths).not.toContain("/takamol");
    }
  });
});

describe("authenticated path policy", () => {
  it("keeps SVP booking agent-only while finance stays admin-only", () => {
    expect(canAccessPath("/svp-booking", ["staff"])).toBe(false);
    expect(canAccessPath("/svp-booking", ["admin"])).toBe(false);
    expect(canAccessPath("/takamol", ["agent"])).toBe(false);
    expect(canAccessPath("/svp-booking", ["agent"])).toBe(true);
    expect(canAccessPath("/finance", ["staff"])).toBe(false);
    expect(canAccessPath("/finance", ["admin"])).toBe(true);
  });

  it("denies booking to provider and management-only roles", () => {
    for (const roles of [["service_provider"], ["management"]]) {
      expect(canAccessPath("/svp-booking", roles)).toBe(false);
    }
  });

  it("lets a mixed admin and agent account use manager routes", () => {
    expect(canAccessPath("/svp-booking", ["admin", "agent"])).toBe(true);
    expect(canAccessPath("/finance", ["admin", "agent"])).toBe(true);
  });
});
