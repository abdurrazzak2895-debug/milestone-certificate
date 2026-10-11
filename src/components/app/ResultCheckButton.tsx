import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { checkSubmissionSvp } from "@/lib/svp.functions";
import type { Work } from "@/lib/works";
import { Button } from "@/components/ui/button";

export function ResultCheckButton({ w }: { w: Work }) {
  const qc = useQueryClient();
  const check = useServerFn(checkSubmissionSvp);
  const [busy, setBusy] = useState(false);
  if (w.status !== "approved") return null;
  const run = async () => {
    setBusy(true);
    try {
      const r = await check({ data: { id: w.id } });
      if (r.status === "error") toast.error(r.message ?? "রেজাল্ট চেক করা যায়নি");
      else if (r.status === "not_found") toast.warning(r.message ?? "রেজাল্ট এখনো আসেনি");
      else toast.success("রেজাল্ট আপডেট হয়েছে");
      qc.invalidateQueries({ queryKey: ["works"] });
      qc.invalidateQueries({ queryKey: ["exams"] });
      qc.invalidateQueries({ queryKey: ["candidates"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "রেজাল্ট চেক করা যায়নি"); }
    finally { setBusy(false); }
  };
  return <Button size="sm" variant="secondary" disabled={busy} onClick={run}><Search className="h-4 w-4" /> {busy ? "চেক হচ্ছে..." : "রেজাল্ট চেকিং"}</Button>;
}
