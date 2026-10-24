import { createFileRoute } from "@tanstack/react-router";
import { AboutServicesCard } from "@/components/app/AboutServices";

export const Route = createFileRoute("/_authenticated/about")({
  head: () => ({
    meta: [
      { title: "আমাদের সেবা / About | Milestone Certificate Institute" },
      {
        name: "description",
        content: "Milestone Certificate Institute-এর সেবা ও দেশভিত্তিক সাপোর্টের তালিকা।",
      },
      { property: "og:title", content: "আমাদের সেবা / About | Milestone Certificate Institute" },
      {
        property: "og:description",
        content: "Milestone Certificate Institute-এর সেবা ও দেশভিত্তিক সাপোর্টের তালিকা।",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-2xl rounded-2xl border shadow-sm">
      <AboutServicesCard />
    </div>
  ),
});
