// Minimal, dependency-free PDF writer for the SVP CBT result summary.
// SVP has no CBT-result PDF endpoint (only tickets, certificates and invoices),
// so the result sheet is generated locally from the real reservation data.

export type SvpResultPdfLine = { label: string; value: string };

export type SvpResultPdfInput = {
  title: string;
  subtitle?: string | null;
  candidateName: string | null;
  passport?: string | null;
  occupation: string | null;
  testCenter: string | null;
  city?: string | null;
  examDate?: string | null;
  result: string | null;
  scores: SvpResultPdfLine[];
  extra?: SvpResultPdfLine[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// PDF base-14 fonts are Latin-1; drop characters they cannot encode.
function toPdfText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, "?")
    .slice(0, 160);
}

function contentStream(input: SvpResultPdfInput): string {
  const lines: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;
  const text = (value: string, size: number, bold = false, offset = 0) => {
    lines.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${MARGIN + offset} ${y} Td (${escapeText(
        toPdfText(value),
      )}) Tj ET`,
    );
    y -= size + 6;
  };
  const rule = () => {
    lines.push(`0.6 w 0.6 G ${MARGIN} ${y + 4} m ${PAGE_WIDTH - MARGIN} ${y + 4} l S 0 G`);
    y -= 10;
  };

  text(input.title, 20, true);
  if (input.subtitle) text(input.subtitle, 10);
  y -= 4;
  rule();

  const rows: SvpResultPdfLine[] = [
    { label: "Candidate", value: input.candidateName ?? "-" },
    ...(input.passport ? [{ label: "Passport", value: input.passport }] : []),
    { label: "Occupation", value: input.occupation ?? "-" },
    { label: "Test center", value: input.testCenter ?? "-" },
    ...(input.city ? [{ label: "City", value: input.city }] : []),
    ...(input.examDate ? [{ label: "Exam date", value: input.examDate }] : []),
    { label: "Result", value: (input.result ?? "pending").toUpperCase() },
  ];

  for (const row of rows) {
    lines.push(
      `BT /F1 10 Tf ${MARGIN} ${y} Td (${escapeText(toPdfText(row.label))}) Tj ET`,
      `BT /F2 11 Tf ${MARGIN + 120} ${y} Td (${escapeText(toPdfText(row.value))}) Tj ET`,
    );
    y -= 20;
  }

  y -= 6;
  text("Scores", 13, true);
  rule();
  if (input.scores.length === 0) {
    text("Scores were not provided by SVP.", 10);
  } else {
    for (const score of input.scores) {
      lines.push(
        `BT /F1 10 Tf ${MARGIN} ${y} Td (${escapeText(toPdfText(score.label))}) Tj ET`,
        `BT /F2 11 Tf ${MARGIN + 120} ${y} Td (${escapeText(toPdfText(score.value))}) Tj ET`,
      );
      y -= 20;
    }
  }

  if (input.extra && input.extra.length > 0) {
    y -= 6;
    text("Reference", 13, true);
    rule();
    for (const row of input.extra) {
      lines.push(
        `BT /F1 10 Tf ${MARGIN} ${y} Td (${escapeText(toPdfText(row.label))}) Tj ET`,
        `BT /F2 10 Tf ${MARGIN + 120} ${y} Td (${escapeText(toPdfText(row.value))}) Tj ET`,
      );
      y -= 18;
    }
  }

  lines.push(
    `BT /F1 8 Tf ${MARGIN} ${MARGIN - 14} Td (${escapeText(
      `Generated ${new Date().toISOString().slice(0, 10)} from the official SVP result data.`,
    )}) Tj ET`,
  );
  return lines.join("\n");
}

/** Build a single-page PDF (base64) summarising a real SVP result. */
export function buildSvpResultPdf(input: SvpResultPdfInput): string {
  const stream = contentStream(input);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  // Latin-1 safe: every character is < U+0100 thanks to toPdfText.
  return btoa(pdf);
}

/** `SVP_CBT_Result` file name with candidate, occupation and test center. */
export function svpCbtResultFileName(
  name: string | null | undefined,
  occupation: string | null | undefined,
  center: string | null | undefined,
): string {
  const slug = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s/g, "_")
      .slice(0, 60);
  const parts = [slug(name), slug(occupation), slug(center)].filter(Boolean);
  return `${parts.join("_") || "SVP"}_SVP_CBT_Result.pdf`;
}
