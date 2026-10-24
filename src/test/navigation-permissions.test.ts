import { describe, expect, it } from "vitest";

import { navigationForRoles } from "@/lib/navigation";
import { canAccessPath } from "@/lib/roles";

const pathsFor = (roles: string[]) => navigationForRoles(roles).map((item) => item.to);

describe("role-based navigation", () => {
  it("shows Takamol and manual SVP booking to admins, staff, and agents", () => {
    for (const roles of [["admin"], ["staff"], ["agent"]]) {
      const paths = pathsFor(roles);
      expect(paths).toContain("/takamol");
      expect(paths).toContain("/svp-booking");
    }
  });

  it("keeps manager navigation precedence for mixed admin and agent roles", () => {
    const paths = pathsFor(["admin", "agent"]);

    expect(paths).toContain("/takamol");
    expect(paths).toContain("/svp-booking");
    expect(paths).toContain("/finance");
    expect(paths).not.toContain("/submit-job");
  });

  it("keeps agent navigation while excluding admin-only navigation", () => {
    const paths = pathsFor(["agent"]);

    expect(paths).toContain("/submit-job");
    expect(paths).toContain("/my-works");
    expect(paths).toContain("/takamol");
    expect(paths).toContain("/svp-booking");
    expect(paths).not.toContain("/finance");
  });

  it("does not expose booking navigation to provider or management-only roles", () => {
    for (const roles of [["service_provider"], ["management"]]) {
      const paths = pathsFor(roles);
      expect(paths).not.toContain("/takamol");
      expect(paths).not.toContain("/svp-booking");
    }
  });
});

describe("authenticated path policy", () => {
  it("allows staff and admins to access Takamol and manual booking", () => {
    expect(canAccessPath("/takamol", ["staff"])).toBe(true);
    expect(canAccessPath("/svp-booking", ["staff"])).toBe(true);
    expect(canAccessPath("/takamol", ["admin"])).toBe(true);
    expect(canAccessPath("/svp-booking", ["admin"])).toBe(true);
  });

  it("allows agents to use booking while keeping finance admin-only", () => {
    expect(canAccessPath("/takamol", ["agent"])).toBe(true);
    expect(canAccessPath("/svp-booking", ["agent"])).toBe(true);
    expect(canAccessPath("/finance", ["staff"])).toBe(false);
    expect(canAccessPath("/finance", ["admin"])).toBe(true);
  });

  it("denies booking to provider and management-only roles", () => {
    for (const roles of [["service_provider"], ["management"]]) {
      expect(canAccessPath("/takamol", roles)).toBe(false);
      expect(canAccessPath("/svp-booking", roles)).toBe(false);
    }
  });

  it("lets a mixed admin and agent account use manager routes", () => {
    expect(canAccessPath("/svp-booking", ["admin", "agent"])).toBe(true);
    expect(canAccessPath("/finance", ["admin", "agent"])).toBe(true);
  });
});
