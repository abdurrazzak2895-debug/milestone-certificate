import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  FileUp,
  Loader2,
  ScanLine,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { extractTicket, type TicketExtraction } from "@/lib/ticket-extract.functions";

export type Stage = "idle" | "uploaded" | "processing" | "done" | "review" | "failed";
const STAGE: Record<Stage, string> = {
  idle: "",
  uploaded: "PDF আপলোড হয়েছে",
  processing: "প্রসেসিং চলছে...",
  done: "ডাটা এক্সট্র্যাকশন সম্পন্ন",
  review: "রিভিউ প্রয়োজন",
  failed: "প্রসেসিং ব্যর্থ — ম্যানুয়ালি পূরণ করুন",
};

async function toB64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export type FieldCheck = {
  label: string;
  extracted: string | null;
  current: string;
  confidence: number;
};
export const fieldStatus = (c: FieldCheck) =>
  !c.extracted
    ? "review"
    : c.current && c.current.toUpperCase() !== c.extracted.toUpperCase()
      ? "mismatch"
      : c.confidence >= 0.9
        ? "verified"
        : "review";

export function SmartTicketUpload({
  file,
  onFile,
  onExtract,
  checks,
  warnings,
  stage,
  setStage,
}: {
  file: File | null;
  onFile: (f: File) => void;
  onExtract: (x: TicketExtraction) => void;
  checks: FieldCheck[];
  warnings: string[];
  stage: Stage;
  setStage: (s: Stage) => void;
}) {
  const run = useServerFn(extractTicket);
  const [url, setUrl] = useState<string | null>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return setStage("failed");
    onFile(f);
    setUrl(URL.createObjectURL(f));
    setStage("uploaded");
    setStage("processing");
    try {
      const r = await run({ data: { mime: f.type, b64: await toB64(f) } });
      if ("error" in r && r.error) {
        setStage("failed");
        return;
      }
      onExtract((r as { extraction: TicketExtraction }).extraction);
    } catch {
      setStage("failed");
    }
  }

  const overall = checks.length
    ? Math.round(
        (checks.reduce((s, c) => s + (c.extracted ? c.confidence : 0), 0) / checks.length) * 100,
      )
    : 0;
  const sts = checks.map(fieldStatus);
  const match = sts.includes("mismatch")
    ? "mismatch"
    : sts.includes("review") || warnings.length
      ? "review"
      : "verified";
  const color = {
    verified: "text-primary",
    review: "text-yellow-500",
    mismatch: "text-destructive",
  } as const;
  const label = {
    verified: "Verified",
    review: "Review Required",
    mismatch: "Mismatch Detected",
  } as const;
  const Icon = { verified: CheckCircle2, review: AlertTriangle, mismatch: XCircle } as const;
  const M = Icon[match];

  return (
    <section className="space-y-3 rounded-2xl border border-primary/40 bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ScanLine className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-bold">Smart Appointment PDF Upload</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        টিকিট PDF আপলোড করলে পরীক্ষার্থীর তথ্য নিজে থেকে ফর্মে বসবে — জমা দেওয়ার আগে যাচাই করে নিন।
      </p>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-primary/60 p-4 text-sm font-semibold hover:bg-muted">
        {stage === "processing" ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <FileUp className="h-5 w-5 text-primary" />
        )}
        <span className="truncate">
          {file ? file.name : "Upload Appointment PDF – Auto Data Extraction"}
        </span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={stage === "processing"}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>
      {stage !== "idle" && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className={stage === "failed" ? "text-destructive" : "text-primary"}>
            ● {STAGE[stage]}
          </span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary underline"
            >
              <ExternalLink className="h-4 w-4" />
              মূল PDF দেখুন
            </a>
          )}
        </div>
      )}
      {(stage === "done" || stage === "review") && checks.length > 0 && (
        <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2 font-semibold">
            <span>Overall Data Confidence: {overall}%</span>
            <span className={`inline-flex items-center gap-1 ${color[match]}`}>
              <M className="h-4 w-4" />
              PDF Match: {label[match]}
            </span>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {checks.map((c, i) => {
              const s = sts[i]!;
              const I = Icon[s === "mismatch" ? "mismatch" : s];
              return (
                <li key={c.label} className={`flex items-center gap-1 ${color[s]}`}>
                  <I className="h-4 w-4 shrink-0" />
                  {c.label}: {c.extracted ? `${Math.round(c.confidence * 100)}%` : "পাওয়া যায়নি"}
                  {s === "mismatch" && ` (টিকিটে ${c.extracted})`}
                </li>
              );
            })}
          </ul>
          {warnings.length > 0 && (
            <ul className="space-y-1 text-yellow-500">
              {warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            স্কোর শুধু পড়ার নিশ্চয়তা বোঝায় — সঠিকতা নিশ্চিত করতে মূল PDF মিলিয়ে দেখুন।
          </p>
        </div>
      )}
    </section>
  );
}
