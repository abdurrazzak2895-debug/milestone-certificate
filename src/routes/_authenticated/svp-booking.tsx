import { createFileRoute } from "@tanstack/react-router";
import { SvpBookingWizard } from "@/components/app/SvpBookingWizard";

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
});

function SvpBookingWorkspace() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <SvpBookingWizard />
    </div>
  );
}
