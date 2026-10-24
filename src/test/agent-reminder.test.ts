import { describe, it, expect } from "vitest";
import { buildAgentReminder, waNumber } from "@/lib/agent-reminder";

describe("agent reminder", () => {
  it("lists candidates with total and date", () => {
    const t = buildAgentReminder("ABC", "2026-10-21", [
      { name: "A", passport: "P1", occupation: "Welder" },
      { name: "B", passport: "P2", occupation: "Plumber" },
    ]);
    expect(t).toContain("২১/10/2026".replace("২১", "21"));
    expect(t).toContain("২. নাম: B");
    expect(t).toContain("মোট পরীক্ষার্থী: ২ জন");
  });
  it("uses saved mobile as WhatsApp number", () => {
    expect(waNumber("01712345678")).toBe("8801712345678");
    expect(waNumber("+8801712345678")).toBe("8801712345678");
    expect(waNumber("123")).toBeNull();
  });
});
