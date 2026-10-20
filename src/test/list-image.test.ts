import { describe, it, expect } from "vitest";
import { chunkRows } from "@/lib/list-image";
describe("list image pages", () => {
  it("splits 20 rows into 3 pages of 8 without dropping any", () => {
    const p = chunkRows(Array.from({ length: 20 }, (_, i) => i));
    expect(p.map((x) => x.length)).toEqual([8, 8, 4]);
  });
});
