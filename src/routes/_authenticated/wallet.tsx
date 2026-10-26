import { createFileRoute } from "@tanstack/react-router";
import { WalletPanel } from "@/components/app/WalletPanel";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "ব্যালেন্স ও ডিপোজিট | Milestone Certificate Institute" },
      {
        name: "description",
        content: "SVP booking wallet: balance, deposit request and admin approval.",
      },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WalletPanel />
    </div>
  );
}
