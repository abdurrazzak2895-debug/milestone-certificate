import { createFileRoute } from "@tanstack/react-router";
import { OfficeAddressCard } from "@/components/app/OfficeAddress";

export const Route = createFileRoute("/_authenticated/office")({
  head: () => ({
    meta: [
      { title: "অফিস ঠিকানা — পরীক্ষা ম্যানেজমেন্ট | Milestone Certificate Institute" },
      { name: "description", content: "অফিসের ছবি, ঠিকানা, ম্যাপ ও ফোন নম্বর।" },
      { property: "og:title", content: "অফিস ঠিকানা — পরীক্ষা ম্যানেজমেন্ট | Milestone Certificate Institute" },
      { property: "og:description", content: "অফিসের ছবি, ঠিকানা, ম্যাপ ও ফোন নম্বর।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-2xl rounded-2xl border shadow-sm">
      <OfficeAddressCard />
    </div>
  ),
});
