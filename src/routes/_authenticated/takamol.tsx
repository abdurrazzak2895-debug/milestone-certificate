import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/ui-bits";
import { TakamolAvailabilityPanel } from "@/components/app/TakamolAvailabilityPanel";

export const Route = createFileRoute("/_authenticated/takamol")({
  head: () => ({
    meta: [
      { title: "Takamol Availability | Milestone Certificate Institute" },
      {
        name: "description",
        content: "Read-only search for available Takamol examination sessions.",
      },
    ],
  }),
  component: TakamolWorkspacePage,
});

function TakamolWorkspacePage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Takamol availability"
        subtitle="পেশা, শহর, তারিখ ও টেস্ট সেন্টার ধাপে ধাপে নির্বাচন করে সেশন দেখুন।"
      />
      <div className="rounded-xl border border-border/70 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
        Read-only workspace: this page checks availability only. It does not create, reserve,
        cancel, reschedule, or pay for a booking.
      </div>
      <TakamolAvailabilityPanel />
    </div>
  );
}
