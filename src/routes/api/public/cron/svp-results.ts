import { createFileRoute } from "@tanstack/react-router";
import { querySvp } from "@/lib/svp.functions";

export const Route = createFileRoute("/api/public/cron/svp-results")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supplied = request.headers.get("apikey");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supplied || !expected || supplied !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 150 * 60_000).toISOString();
        const retryBefore = new Date(Date.now() - 5 * 60_000).toISOString();
        const { data: works, error } = await supabaseAdmin
          .from("job_submissions")
          .select("id, passport_no, occupation_id, svp_checked_at")
          .eq("status", "approved")
          .eq("svp_result", "PENDING")
          .lte("exam_at", cutoff)
          .or(`svp_checked_at.is.null,svp_checked_at.lte.${retryBefore}`)
          .limit(100);
        if (error) return Response.json({ ok: false }, { status: 500 });

        let checked = 0;
        for (const work of works ?? []) {
          if (!work.occupation_id) continue;
          const { data: occupation } = await supabaseAdmin.from("occupations").select("svp_key").eq("id", work.occupation_id).maybeSingle();
          if (!occupation?.svp_key) continue;
          const result = await querySvp(work.passport_no, occupation.svp_key);
          await supabaseAdmin.from("job_submissions").update({
            svp_result: result.status === "found" ? result.result : "PENDING",
            svp_checked_at: new Date().toISOString(),
          }).eq("id", work.id);
          checked++;
        }
        return Response.json({ ok: true, checked });
      },
    },
  },
});