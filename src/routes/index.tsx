import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "পরীক্ষার্থী ও পরীক্ষা ব্যবস্থাপনা | Milestone Certificate Institute" },
      { name: "description", content: "পরীক্ষার্থী, পরীক্ষা, রেজাল্ট ও বিশ্লেষণ সহজে পরিচালনা করুন।" },
      { property: "og:title", content: "পরীক্ষার্থী ও পরীক্ষা ব্যবস্থাপনা | Milestone Certificate Institute" },
      { property: "og:description", content: "পরীক্ষার্থী, পরীক্ষা, রেজাল্ট ও বিশ্লেষণ সহজে পরিচালনা করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
