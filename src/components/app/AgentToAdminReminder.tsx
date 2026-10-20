import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { worksQ } from "@/lib/works";
import { occQ, todayStr, addDays } from "@/lib/data";
import { bnNum, waNumber } from "@/lib/agent-reminder";
import { DateSelect } from "@/components/app/DateSelect";
import { ShareKit } from "@/components/app/ShareKit";

const FALLBACK_ADMIN = "01787900267";
const dhaka = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
const tm = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });

/** Agent → Admin: next day's exam list as WhatsApp text and image. */
export function AgentToAdminReminder({ agentName, myId }: { agentName: string; myId?: string }) {
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const { data: works = [] } = useQuery(worksQ);
  const { data: occ = [] } = useQuery(occQ);
  const { data: adminNo = FALLBACK_ADMIN } = useQuery({
    queryKey: ["admin_whatsapp"],
    queryFn: async () => (await supabase.from("settings").select("value").eq("key", "admin_whatsapp").maybeSingle()).data?.value?.trim() || FALLBACK_ADMIN,
  });
  const list = useMemo(() => {
    const on = new Map(occ.map((o) => [o.id, o.name]));
    return works
      .filter((w) => (!myId || w.submitted_by === myId) && w.status !== "rejected" && !!w.exam_at && dhaka(w.exam_at) === date)
      .sort((a, b) => a.exam_at.localeCompare(b.exam_at))
      .map((w) => ({ name: w.candidate_name.toUpperCase(), passport: w.passport_no.toUpperCase(), occupation: on.get(w.occupation_id ?? "") ?? "", time: tm(w.exam_at) }));
  }, [works, occ, date, myId]);
  const incomplete = list.filter((c) => !c.passport || !c.occupation).length;
  const [y, m, d] = date.split("-");
  const isTomorrow = date === addDays(todayStr(), 1);
  const head = isTomorrow ? "আগামীকালের (পরবর্তী দিনের) পরীক্ষার তালিকা" : "পরীক্ষার তালিকা";
  const text = `আসসালামু আলাইকুম।\n\n📢 ${head}\nএজেন্ট: ${agentName}\n📅 তারিখ: ${d}/${m}/${y}\n\n${list
    .map((c, i) => `${bnNum(i + 1)}. ${c.name}\nপাসপোর্ট: ${c.passport}\nপেশা: ${c.occupation || "-"}\nসময়: ${c.time}`)
    .join("\n\n")}\n\nমোট পরীক্ষার্থী: ${bnNum(list.length)} জন`;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">📲 Admin-কে পরীক্ষার তালিকা পাঠান</h2>
        <DateSelect value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{bnNum(list.length)} জন পরীক্ষার্থী{isTomorrow ? " · আগামীকাল" : ""}</p>
      {incomplete > 0 && <p className="mt-1 text-sm text-destructive">⚠️ {bnNum(incomplete)} জনের পাসপোর্ট/পেশা অসম্পূর্ণ — পাঠানোর আগে যাচাই করুন</p>}
      <div className="mt-2">
        <ShareKit
          title="Admin-কে তালিকা পাঠান"
          disabled={!list.length}
          text={text}
          wa={waNumber(adminNo)}
          spec={{ heading: head, sub: `${agentName} · ${d}/${m}/${y} · মোট ${bnNum(list.length)} জন`, rows: list.map((c, i) => ({ title: `${bnNum(i + 1)}. ${c.name}`, lines: [`পাসপোর্ট: ${c.passport}`, `পেশা: ${c.occupation || "-"} · সময়: ${c.time}`] })) }}
        />
      </div>
    </section>
  );
}
