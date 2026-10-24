import { describe, expect, it } from "vitest";

import { navigationForRoles } from "@/lib/navigation";
import { canAccessPath } from "@/lib/roles";

const pathsFor = (roles: string[]) => navigationForRoles(roles).map((item) => item.to);

describe("role-based navigation", () => {
  it("shows Takamol and manual SVP booking to admins and staff", () => {
    for (const roles of [["admin"], ["staff"]]) {
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

  it("does not expose manager-only navigation to agents", () => {
    const paths = pathsFor(["agent"]);

    expect(paths).not.toContain("/takamol");
    expect(paths).not.toContain("/svp-booking");
    expect(paths).not.toContain("/finance");
  });
});

describe("authenticated path policy", () => {
  it("allows staff and admins to access Takamol and manual booking", () => {
    expect(canAccessPath("/takamol", ["staff"])).toBe(true);
    expect(canAccessPath("/svp-booking", ["staff"])).toBe(true);
    expect(canAccessPath("/takamol", ["admin"])).toBe(true);
    expect(canAccessPath("/svp-booking", ["admin"])).toBe(true);
  });

  it("denies agents manager pages while keeping finance admin-only", () => {
    expect(canAccessPath("/takamol", ["agent"])).toBe(false);
    expect(canAccessPath("/svp-booking", ["agent"])).toBe(false);
    expect(canAccessPath("/finance", ["staff"])).toBe(false);
    expect(canAccessPath("/finance", ["admin"])).toBe(true);
  });

  it("lets a mixed admin and agent account use manager routes", () => {
    expect(canAccessPath("/svp-booking", ["admin", "agent"])).toBe(true);
    expect(canAccessPath("/finance", ["admin", "agent"])).toBe(true);
  });
});
