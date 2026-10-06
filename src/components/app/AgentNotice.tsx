import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
