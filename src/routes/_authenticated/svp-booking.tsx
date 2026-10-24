import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/ui-bits";
import { SvpBookingWizard } from "@/components/app/SvpBookingWizard";
import { SvpManualRecordPanel } from "@/components/app/SvpManualRecordPanel";

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

const SVP_PORTAL_URL = "https://svp-international.pacc.sa/";

function SvpBookingWorkspace() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="SVP booking"
        subtitle="Sign in to SVP, choose an occupation and session, and create the reservation through the official SVP API."
        actions={
          <a href={SVP_PORTAL_URL} target="_blank" rel="noreferrer">
            <Button type="button" variant="outline" size="sm">
              <ExternalLink className="mr-2 h-4 w-4" /> Official portal
            </Button>
          </a>
        }
      />
      <SvpBookingWizard />
      <SvpManualRecordPanel />
    </div>
  );
}
