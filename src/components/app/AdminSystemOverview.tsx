import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  LoaderCircle,
  MapPin,
  MessageSquare,
  Settings,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ADMIN_LINKS = [
  { to: "/submissions", label: "Submitted Works", icon: ClipboardCheck },
  { to: "/management", label: "রিসেপশন", icon: UserCheck },
  { to: "/candidates", label: "পরীক্ষার্থী", icon: Users },
  { to: "/exams", label: "পরীক্ষা", icon: CalendarDays },
  { to: "/results", label: "রেজাল্ট", icon: ClipboardCheck },
  { to: "/reports", label: "রিপোর্ট", icon: BarChart3 },
  { to: "/accounts", label: "এজেন্ট/প্রোভাইডার", icon: Users },
  { to: "/payments", label: "পেমেন্ট", icon: ClipboardCheck },
  { to: "/wallet", label: "ব্যালেন্স/ডিপোজিট", icon: Wallet },
  { to: "/svp-history", label: "SVP বুকিং হিস্ট্রি", icon: ClipboardCheck },
  { to: "/messages", label: "মেসেজ ম্যানেজমেন্ট", icon: MessageSquare },
  { to: "/center-addresses", label: "কেন্দ্রের ঠিকানা", icon: MapPin },
  { to: "/agency-report", label: "এজেন্সি রিপোর্ট", icon: BarChart3 },
  { to: "/finance", label: "গোপন হিসাব", icon: BarChart3 },
  { to: "/settings", label: "সেটিংস", icon: Settings },
] as const;

/** Admin control centre: wallet health plus a shortcut to every management system. */
export function AdminSystemOverview() {
  const walletsQuery = useQuery({
    queryKey: ["admin-wallet-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_accounts")
        .select("user_id, balance")
        .order("balance", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const depositsQuery = useQuery({
    queryKey: ["admin-wallet-deposits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_deposits")
        .select("id, amount, status")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [cbtFee, setCbtFee] = useState("50");
  const [savingFee, setSavingFee] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("key, value");
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const row = settingsQuery.data?.find((entry) => entry.key === "cbt_result_fee");
    if (row?.value != null) setCbtFee(String(row.value));
  }, [settingsQuery.data]);

  const saveCbtFee = async () => {
    const value = Number(cbtFee);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("সঠিক ফি লিখুন (০ মানে ফ্রি)।");
      return;
    }
    setSavingFee(true);
    try {
      const { error } = await supabase
        .from("settings")
        .upsert({ key: "cbt_result_fee", value: String(value) }, { onConflict: "key" });
      if (error) throw error;
      toast.success(`CBT result PDF ফি ৳${value} সেট হয়েছে।`);
      void settingsQuery.refetch();
    } catch {
      toast.error("ফি সেভ করা যায়নি।");
    } finally {
      setSavingFee(false);
    }
  };

  const wallets = walletsQuery.data ?? [];
  const deposits = depositsQuery.data ?? [];
  const totalBalance = wallets.reduce((sum, entry) => sum + Number(entry.balance ?? 0), 0);
  const pending = deposits.filter((entry) => entry.status === "pending");
  const pendingAmount = pending.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const loading = walletsQuery.isPending || depositsQuery.isPending;

  return (
    <section className="card-surface space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Admin control centre
          </p>
          <h2 className="text-lg font-bold">সব সিস্টেম হ্যান্ডেল করুন</h2>
        </div>
        {loading && <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Wallet accounts</p>
          <p className="mt-1 text-2xl font-bold">{wallets.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">মোট ব্যালেন্স</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">
            ৳{totalBalance.toLocaleString("en-BD", { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pending deposit</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{pending.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pending amount</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">
            ৳{pendingAmount.toLocaleString("en-BD", { maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">CBT result PDF ফি (৳)</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={cbtFee}
            onChange={(event) => setCbtFee(event.target.value)}
            inputMode="decimal"
            className="h-9 w-28"
            aria-label="CBT result PDF fee"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void saveCbtFee()}
            disabled={savingFee}
          >
            {savingFee ? <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Save fee
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          প্রতিটি CBT result PDF ডাউনলোডে এই ফি wallet থেকে কাটা হবে (০ = ফ্রি)।
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ADMIN_LINKS.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to as "/dashboard"}
            className="flex items-center gap-2 rounded-xl border bg-background/40 p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <entry.icon className="h-4 w-4 text-primary" />
            {entry.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
