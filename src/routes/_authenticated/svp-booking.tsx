import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { SvpBookingWizard } from "@/components/app/SvpBookingWizard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/svp-booking")({
  head: () => ({
    meta: [
      { title: "SVP booking | Milestone Certificate Institute" },
      {
        name: "description",
        content:
          "Book real SVP exam appointments with occupation, eligibility, test center and credit checks, then keep a local record.",
      },
    ],
  }),
  component: SvpBookingWorkspace,
  errorComponent: SvpBookingError,
});

function SvpBookingWorkspace() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <SvpBookingWizard />
    </div>
  );
}

function SvpBookingError({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <h1 className="text-lg font-bold">SVP booking could not load</h1>
        <p className="text-sm text-destructive">{message || "Unknown error"}</p>
        <p className="text-xs text-muted-foreground">
          Build v14 · If this repeats, sign out of SVP and sign in again from this page.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              reset();
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Try again
          </Button>
          <a href="/dashboard">
            <Button type="button" variant="outline">
              Dashboard
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
