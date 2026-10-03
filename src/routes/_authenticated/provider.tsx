import { createFileRoute } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/provider")({
  head: () => ({
    meta: [
      { title: "সার্ভিস প্রোভাইডার — কাজের তালিকা" },
      { name: "description", content: "অনুমোদিত কাজের তালিকা সার্ভিস প্রোভাইডারদের জন্য।" },
      { property: "og:title", content: "সার্ভিস প্রোভাইডার — কাজের তালিকা" },
      { property: "og:description", content: "অনুমোদিত কাজের তালিকা সার্ভিস প্রোভাইডারদের জন্য।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm">
      <Briefcase className="mx-auto h-12 w-12 text-primary" />
      <h1 className="mt-4 font-display text-2xl font-bold">আমার কাজ</h1>
      <p className="mt-2 text-muted-foreground">অ্যাডমিন অনুমোদিত কাজগুলো এখানে দেখাবে।</p>
    </div>
  ),
});
