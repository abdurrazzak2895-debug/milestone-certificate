import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyUnpaidFlag } from "@/lib/accounts.functions";

export const agentNoticeQ = {
  queryKey: ["agent_notice"],
  queryFn: async () => {
    const { data } = await supabase.from("settings").select("value").eq("key", "agent_notice").maybeSingle();
    return data?.value?.trim() ?? "";
  },
  refetchInterval: 60_000,
};

export function AgentNotice() {
  const { data: text = "" } = useQuery(agentNoticeQ);
  if (!text) return null;
  return (
    <div className="mb-4 flex items-center gap-2 overflow-hidden rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
      <Megaphone className="h-4 w-4 shrink-0 text-primary" />
      <div className="relative flex-1 overflow-hidden">
        <p className="animate-marquee whitespace-nowrap text-sm font-medium">{text}</p>
      </div>
    </div>
  );
}

/** True when admin has flagged the logged-in account as having unpaid dues. */
export function useMyUnpaid() {
  const getUnpaid = useServerFn(getMyUnpaidFlag);
  const { data = false } = useQuery({ queryKey: ["my_unpaid"], queryFn: () => getUnpaid(), staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true });
  return data;
}

/** Red warning shown on every work event of an unpaid-flagged account. */
export function UnpaidNotice() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-destructive bg-destructive/10 p-4 text-sm shadow-sm">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-destructive" />
      <div>
        <p className="font-bold text-destructive">⚠️ Payment বকেয়া সংক্রান্ত সতর্কতা</p>
        <p className="mt-1 text-foreground/90">আপনার এজেন্ট অ্যাকাউন্টে Payment বকেয়া রয়েছে। বকেয়া পরিশোধ না করা পর্যন্ত আপনার Submit করা কাজ গ্রহণযোগ্য নাও হতে পারে। কাজ Submit করার আগে অনুগ্রহ করে আপনার সব বকেয়া Payment পরিশোধ নিশ্চিত করুন।</p>
      </div>
  );
}
