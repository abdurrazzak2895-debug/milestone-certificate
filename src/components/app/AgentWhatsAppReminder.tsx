import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { ShareKit } from "@/components/app/ShareKit";
import { worksQ } from "@/lib/works";
import { occQ, todayStr, addDays } from "@/lib/data";
import { listAccounts } from "@/lib/accounts.functions";
import { buildAgentReminder, waNumber, bnNum } from "@/lib/agent-reminder";
import { DateSelect } from "@/components/app/DateSelect";
import { Button } from "@/components/ui/button";

const dhaka = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

/** Admin-only: per-agent exam reminder for a date, sent via WhatsApp or copied. */
export function AgentWhatsAppReminder() {
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const { data: works = [] } = useQuery(worksQ);
  const { data: occ = [] } = useQuery(occQ);
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });

  const groups = useMemo(() => {
    const occName = new Map(occ.map((o) => [o.id, o.name]));
    const acc = new Map(accounts.map((a) => [a.id, a]));
    const map = new Map<
      string,
      {
        name: string;
        mobile: string;
        list: { name: string; passport: string; occupation: string }[];
      }
    >();
    for (const w of works) {
      if (w.status !== "approved" || !w.exam_at || dhaka(w.exam_at) !== date) continue;
      const a = acc.get(w.submitted_by);
      const g = map.get(w.submitted_by) ?? {
        name: a?.name ?? "এজেন্ট",
        mobile: a?.mobile ?? "",
        list: [],
      };
      g.list.push({
        name: w.candidate_name.toUpperCase(),
        passport: w.passport_no.toUpperCase(),
        occupation: occName.get(w.occupation_id ?? "") ?? "-",
      });
      map.set(w.submitted_by, g);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [works, occ, accounts, date]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("মেসেজ কপি হয়েছে");
    } catch {
      toast.error("কপি করা যায়নি");
    }
  };

  return (
    <div className="mb-5 rounded-2xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">📲 এজেন্ট পরীক্ষা রিমাইন্ডার (WhatsApp)</h2>
        <DateSelect value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">এই তারিখে কোনো অনুমোদিত পরীক্ষা নেই।</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const text = buildAgentReminder(g.name, date, g.list);
            const wa = waNumber(g.mobile);
            return (
              <div
                key={g.name + g.mobile}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <div>
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.mobile || "মোবাইল নেই"} · {bnNum(g.list.length)} জন পরীক্ষার্থী
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(text)}>
                    <Copy className="mr-1 h-4 w-4" />
                    কপি
                  </Button>
                  <ShareKit
                    title={`${g.name} — পরীক্ষার তালিকা`}
                    text={text}
                    wa={wa}
                    spec={{
                      heading: "পরীক্ষার্থীদের তালিকা",
                      sub: `${g.name} · ${date.split("-").reverse().join("/")} · মোট ${bnNum(g.list.length)} জন`,
                      rows: g.list.map((c, i) => ({
                        title: `${bnNum(i + 1)}. ${c.name}`,
                        lines: [`পাসপোর্ট: ${c.passport}`, `পেশা: ${c.occupation}`],
                      })),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
