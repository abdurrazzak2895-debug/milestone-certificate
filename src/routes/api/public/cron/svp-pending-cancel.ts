import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/svp-pending-cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token || token.length < 32) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: valid } = await supabaseAdmin.rpc(
          "verify_cron_token" as never,
          {
            _name: "svp_pending_cancel",
            _token: token,
          } as never,
        );
        if (valid !== true) return new Response("Unauthorized", { status: 401 });

        const { data, error } = await supabaseAdmin.rpc(
          "cancel_stale_svp_bookings" as never,
          { _minutes: 30 } as never,
        );
        if (error) return Response.json({ ok: false }, { status: 500 });
        return Response.json({ ok: true, cancelled: Number(data ?? 0) });
      },
    },
  },
});
