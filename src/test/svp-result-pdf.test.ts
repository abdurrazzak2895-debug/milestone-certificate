import { describe, expect, it } from "vitest";
import { buildSvpResultPdf, svpCbtResultFileName } from "@/lib/svp-result-pdf";

function decode(base64: string): string {
  return atob(base64);
}

const BACKSLASH = String.fromCharCode(92);

const input = {
  title: "SVP CBT Result",
  subtitle: "Saudi Skill Verification Program",
  candidateName: "MD RAHADUL ISLAM",
  passport: "A13478023",
  occupation: "Load and Unload Worker",
  testCenter: "Pabna Technical Training Centre",
  city: "Rajshahi",
  examDate: "17/05/2026",
  result: "passed",
  scores: [
    { label: "Total", value: "81" },
    { label: "CBT", value: "23" },
    { label: "Practical", value: "58" },
  ],
  extra: [{ label: "Reservation", value: "4066364" }],
};

describe("SVP CBT result PDF", () => {
  it("produces a valid single-page PDF with the real result content", () => {
    const pdf = decode(buildSvpResultPdf(input));

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("/BaseFont /Helvetica-Bold");
    expect(pdf).toContain("(SVP CBT Result)");
    expect(pdf).toContain("(MD RAHADUL ISLAM)");
    expect(pdf).toContain("(A13478023)");
    expect(pdf).toContain("(Load and Unload Worker)");
    expect(pdf).toContain("(Pabna Technical Training Centre)");
    expect(pdf).toContain("(PASSED)");
    expect(pdf).toContain("(Total)");
    expect(pdf).toContain("(81)");
    expect(pdf).toContain("(CBT)");
    expect(pdf).toContain("(23)");
    expect(pdf).toContain("(Practical)");
    expect(pdf).toContain("(58)");
    expect(pdf).toContain("(4066364)");
  });

  it("keeps xref offsets pointing at the objects", () => {
    const pdf = decode(buildSvpResultPdf(input));
    const xrefIndex = pdf.indexOf("\nxref\n");
    const rows = pdf
      .slice(xrefIndex)
      .split("\n")
      .filter((line) => /^\d{10} 00000 n $/.test(line));

    expect(rows).toHaveLength(6);
    for (const row of rows) {
      const offset = Number(row.slice(0, 10));
      expect(pdf.slice(offset)).toMatch(/^\d+ 0 obj/);
    }
  });

  it("escapes parentheses and strips characters base-14 fonts cannot encode", () => {
    const pdf = decode(
      buildSvpResultPdf({
        ...input,
        candidateName: "MD (RAHADUL) ISLAM " + BACKSLASH + " " + String.fromCharCode(1591),
        scores: [],
      }),
    );

    const escaped =
      "(MD " + BACKSLASH + "(RAHADUL" + BACKSLASH + ") ISLAM " + BACKSLASH + BACKSLASH + " ?)";
    expect(pdf).toContain(escaped);
    expect(pdf).toContain("Scores were not provided by SVP.");
  });

  it("builds the file name from candidate, occupation and test center", () => {
    expect(
      svpCbtResultFileName(
        "MD RAHADUL ISLAM",
        "Load and Unload Worker",
        "Pabna Technical Training Centre",
      ),
    ).toBe(
      "MD_RAHADUL_ISLAM_Load_and_Unload_Worker_Pabna_Technical_Training_Centre_SVP_CBT_Result.pdf",
    );
    expect(svpCbtResultFileName(null, undefined, "")).toBe("SVP_SVP_CBT_Result.pdf");
  });
});
