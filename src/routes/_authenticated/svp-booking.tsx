import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/ui-bits";
import { SvpOtpLoginDraft } from "@/components/app/SvpOtpLoginDraft";

export const Route = createFileRoute("/_authenticated/svp-booking")({
  head: () => ({
    meta: [
      { title: "SVP Login | Milestone Certificate Institute" },
      {
        name: "description",
        content: "SVP username/password and OTP login flow for agent, staff, and admin users.",
      },
    ],
  }),
  component: SvpLoginWorkspace,
});

const SVP_PORTAL_URL = "https://svp-international.pacc.sa/";

function SvpLoginWorkspace() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="SVP Login"
        subtitle="Sign in with your SVP username and password, then enter the OTP if requested."
        actions={
          <a href={SVP_PORTAL_URL} target="_blank" rel="noreferrer">
            <Button type="button" variant="outline" size="sm">
              <ExternalLink className="mr-2 h-4 w-4" /> Official portal
            </Button>
          </a>
        }
      />
      <SvpOtpLoginDraft />
    </div>
  );
}
