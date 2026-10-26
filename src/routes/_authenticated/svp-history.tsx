import { createFileRoute } from "@tanstack/react-router";
import { SvpBookingAdminHistory } from "@/components/app/SvpBookingAdminHistory";

export const Route = createFileRoute("/_authenticated/svp-history")({
  head: () => ({
    meta: [
      { title: "SVP বুকিং হিস্ট্রি | Milestone Certificate Institute" },
      {
        name: "description",
        content: "Admin view of every SVP booking recorded by the system.",
      },
    ],
  }),
  component: SvpHistoryPage,
});

function SvpHistoryPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <SvpBookingAdminHistory />
    </div>
  );
}
