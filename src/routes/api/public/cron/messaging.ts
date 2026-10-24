import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/messaging")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token || token.length < 32) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: valid } = await supabaseAdmin.rpc("verify_cron_token" as any, {
          _name: "messaging",
          _token: token,
        });
        if (valid !== true) return new Response("Unauthorized", { status: 401 });
        const { runAutomations, processPending } = await import("@/lib/messaging.server");
        const a = await runAutomations();
        return Response.json({ ok: true, ...a, ...(await processPending(150)) });
      },
    },
  },
});
