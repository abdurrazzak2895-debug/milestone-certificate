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
  const { data = false } = useQuery({ queryKey: ["my_unpaid"], queryFn: () => getUnpaid(), staleTime: 60_000 });
  return data;
}

/** Red warning shown on every work event of an unpaid-flagged account. */
export function UnpaidNotice() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-destructive bg-destructive/10 p-4 text-sm shadow-sm">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-destructive" />
      <div>
        <p className="font-bold text-destructive">বকেয়া পেমেন্ট সংক্রান্ত জরুরি নোটিশ</p>
        <p className="mt-1 text-foreground/90">আপনার অ্যাকাউন্টে পূর্ববর্তী কাজের পেমেন্ট বকেয়া রয়েছে। আপনার কাজটি সিস্টেমে জমা করা হলেও, বকেয়া পরিশোধ ও নিষ্পত্তি না হওয়া পর্যন্ত Admin কর্তৃক এই কাজটি চূড়ান্ত অনুমোদন (Approve) স্থগিত বা বাতিল হতে পারে। জরুরি ভিত্তিতে পেমেন্ট ক্লিয়ার করার জন্য অনুরোধ করা যাচ্ছে।</p>
      </div>
    </div>
  );
}
