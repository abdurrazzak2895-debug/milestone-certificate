import {
  Award,
  BadgeCheck,
  CircleSlash,
  Clock3,
  Download,
  LoaderCircle,
  Trophy,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SvpReservation } from "@/lib/svp-api.shared";

type Props = {
  reservation: SvpReservation;
  downloading: boolean;
  onDownloadCertificate: () => void;
};

function resultTone(result: string | null): { label: string; className: string } {
  const value = (result ?? "").toLowerCase();
  if (value === "passed") return { label: "Passed", className: "bg-success-soft text-success" };
  if (value === "failed") return { label: "Failed", className: "bg-danger-soft text-danger" };
  if (value === "absent") return { label: "Absent", className: "bg-muted text-muted-foreground" };
  return { label: "Pending", className: "bg-warning-soft text-warning" };
}

/** Result status + score + real certificate download for one SVP reservation. */
export function SvpResultPanel({ reservation, downloading, onDownloadCertificate }: Props) {
  const result = resultTone(reservation.finalResult ?? reservation.examResult);
  const certificate = reservation.certificate;
  const passed = result.label === "Passed";
  const hasCertificate = Boolean(certificate && certificate.status?.toLowerCase() === "active");

  const scores = [
    { label: "Total", value: reservation.totalScore },
    { label: "CBT", value: reservation.cbtScore },
    { label: "Practical", value: reservation.practicalScore },
  ].filter((entry) => entry.value !== null);

  return (
    <section
      className="space-y-3 rounded-2xl border bg-card p-4"
      aria-label={`Result for reservation ${reservation.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            SVP result
          </p>
          <h3 className="truncate text-base font-bold">
            {reservation.occupationEnglishName ?? reservation.occupationName ?? "Occupation"}
          </h3>
          <p className="text-xs text-muted-foreground">
            #{reservation.id}
            {reservation.centerName ? ` · ${reservation.centerName}` : ""}
            {reservation.city ? ` · ${reservation.city}` : ""}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${result.className}`}
        >
          {passed ? (
            <BadgeCheck className="h-3.5 w-3.5" />
          ) : result.label === "Failed" ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <Clock3 className="h-3.5 w-3.5" />
          )}
          {result.label}
        </span>
      </div>

      {scores.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {scores.map((score) => (
            <span key={score.label} className="rounded-lg border bg-muted/30 px-2 py-1">
              <span className="text-muted-foreground">{score.label}: </span>
              <span className="font-semibold">{score.value}</span>
            </span>
          ))}
        </div>
      )}

      {certificate && (
        <div className="space-y-1 rounded-xl border border-emerald-300/50 bg-emerald-50/60 p-3 text-xs text-emerald-950">
          <p className="flex items-center gap-1.5 font-semibold">
            <Award className="h-4 w-4" /> Certificate {certificate.certificateNumber ?? ""}
          </p>
          <p>
            Status: {certificate.status ?? "unknown"}
            {certificate.validUntil ? ` · valid until ${certificate.validUntil}` : ""}
          </p>
        </div>
      )}

      {hasCertificate ? (
        <Button type="button" size="sm" onClick={onDownloadCertificate} disabled={downloading}>
          {downloading ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Certificate PDF
        </Button>
      ) : (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {passed
            ? "SVP has not issued a certificate for this passed result yet. Refresh to check again."
            : "A certificate is only issued for a passed SVP result."}
        </p>
      )}

      {reservation.totalScore !== null && passed && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Trophy className="h-3.5 w-3.5" /> Final score {reservation.totalScore}
        </p>
      )}
    </section>
  );
}
