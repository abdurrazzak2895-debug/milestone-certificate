import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtDhakaDateTime } from "@/lib/works";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const KINDS: [string, string, string][] = [
  ["payment_received", "💰 টাকা পেয়েছি", "bg-primary/15 text-primary"],
  ["payment_pending", "⏳ টাকা বাকি", "bg-destructive/15 text-destructive"],
  ["general", "📝 সাধারণ নোট", "bg-muted text-foreground"],
];

/** Notes per work: agent adds (append-only), admin reads all. RLS scopes rows. */
export function WorkNotes({ submissionId, canAdd }: { submissionId: string; canAdd: boolean }) {
  const qc = useQueryClient();
  const key = ["work-notes", submissionId];
  const { data: notes = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_notes")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("general");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await supabase
      .from("work_notes")
      .insert({ submission_id: submissionId, kind, body: text });
    setBusy(false);
    if (error) return toast.error("নোট সেভ করা যায়নি");
    toast.success("নোট যোগ হয়েছে");
    setBody("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: key });
  };

  const meta = (k: string) => KINDS.find((x) => x[0] === k) ?? KINDS[2]!;

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-muted/40 p-2 text-sm">
              <span className={`mr-2 rounded-full px-2 py-0.5 text-xs ${meta(n.kind)[2]}`}>
                {meta(n.kind)[1]}
              </span>
              {n.body}
              <div className="mt-0.5 text-xs text-muted-foreground">
                {fmtDhakaDateTime(n.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!canAdd && notes.length === 0 && (
        <p className="text-xs text-muted-foreground">এজেন্টের কোনো নোট নেই।</p>
      )}
      {canAdd &&
        (open ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {KINDS.map(([k, l]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-full border px-3 py-1 text-xs ${kind === k ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <Textarea
              value={body}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
              placeholder="যেমন: ৫০০০ টাকা পেয়েছি, বাকি ২০০০"
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !body.trim()} onClick={save}>
                সেভ করুন
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                বাদ দিন
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            + নোট যোগ করুন
          </Button>
        ))}
    </div>
  );
}
