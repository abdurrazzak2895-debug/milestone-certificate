import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/ui-bits";
import { SvpLoginPanel } from "@/components/app/SvpLoginPanel";
import { SvpManualRecordPanel } from "@/components/app/SvpManualRecordPanel";

export const Route = createFileRoute("/_authenticated/svp-booking")({
  head: () => ({
    meta: [
      { title: "SVP booking | Milestone Certificate Institute" },
      {
        name: "description",
        content:
          "Manual SVP record tracker plus SVP username/password login for agent, staff, and admin users.",
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
        subtitle="Record candidate reservations manually and sign in to the SVP portal with username and password."
        actions={
          <a href={SVP_PORTAL_URL} target="_blank" rel="noreferrer">
            <Button type="button" variant="outline" size="sm">
              <ExternalLink className="mr-2 h-4 w-4" /> Official portal
            </Button>
          </a>
        }
      />
      <SvpManualRecordPanel />
      <SvpLoginPanel />
    </div>
  );
}
