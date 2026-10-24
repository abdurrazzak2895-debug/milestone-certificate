import { createFileRoute } from "@tanstack/react-router";
import { querySvp, svpUpdate } from "@/lib/svp.functions";

export const Route = createFileRoute("/api/public/cron/svp-results")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token || token.length < 32) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: valid } = await supabaseAdmin.rpc("verify_cron_token" as any, {
          _name: "svp_results",
          _token: token,
        });
        if (valid !== true) return new Response("Unauthorized", { status: 401 });
        const cutoff = new Date(Date.now() - 150 * 60_000).toISOString();
        const retryBefore = new Date(Date.now() - 5 * 60_000).toISOString();
        const { data: works, error } = await supabaseAdmin
          .from("job_submissions")
          .select("id, passport_no, occupation_id, svp_checked_at, svp_result, exam_at")
          .eq("status", "approved")
          .neq("svp_result", "PASS")
          .lte("exam_at", cutoff)
          // Results publish 2.5h–8h after exam start and early FAILs can later turn PASS,
          // so keep rechecking non-PASS works for 10h; PENDING ones keep being checked.
          .gte("exam_at", new Date(Date.now() - 3 * 24 * 3600_000).toISOString())
          .or(`svp_checked_at.is.null,svp_checked_at.lte.${retryBefore}`)
          .limit(100);
        if (error) return Response.json({ ok: false }, { status: 500 });

        let checked = 0;
        for (const work of works ?? []) {
          if (!work.occupation_id) continue;
          // FAIL/NOT_FOUND are only provisional within 10h of exam start.
          if (
            work.svp_result !== "PENDING" &&
            Date.now() - new Date((work as any).exam_at ?? 0).getTime() > 10 * 3600_000
          )
            continue;
          const { data: occupation } = await supabaseAdmin
            .from("occupations")
            .select("svp_key")
            .eq("id", work.occupation_id)
            .maybeSingle();
          if (!occupation?.svp_key) continue;
          const result = await querySvp(work.passport_no, occupation.svp_key);
          // Network/server errors only bump checked_at so the next run retries.
          const upd =
            result.status === "error"
              ? { svp_checked_at: new Date().toISOString() }
              : svpUpdate(result, work.exam_at, work.svp_result);
          await supabaseAdmin.from("job_submissions").update(upd).eq("id", work.id);
          checked++;
        }
        return Response.json({ ok: true, checked });
      },
    },
  },
});
