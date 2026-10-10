import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { homeForRoles, isManager } from "@/lib/roles";
import { checkDeviceSession, forceSignOut } from "@/lib/device-session";

const AGENT_PATHS = ["/dashboard", "/submit-job", "/my-works"];
const PROVIDER_PATHS = ["/provider"];
const ADMIN_ONLY_PATHS = ["/finance"];
const MANAGEMENT_PATHS = ["/management", "/submissions"];

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const reason = await checkDeviceSession();
    if (reason) {
      await forceSignOut(reason);
      throw redirect({ to: "/auth" });
    }
    const { data: rows } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const roles = (rows ?? []).map((r) => r.role as string);
    if (roles.length === 0) throw redirect({ to: "/portal" });
    if (ADMIN_ONLY_PATHS.includes(location.pathname) && !roles.includes("admin")) throw redirect({ to: homeForRoles(roles) });
    if (!isManager(roles)) {
      const { data: active } = await supabase.rpc("is_active_account", { _user_id: data.user.id });
      if (active === false) {
        await supabase.auth.signOut();
        throw redirect({ to: "/auth" });
      }
      const allowed = [
        ...(roles.includes("agent") ? AGENT_PATHS : []),
        ...(roles.includes("service_provider") ? PROVIDER_PATHS : []),
        ...(roles.includes("management") ? MANAGEMENT_PATHS : []),
      ];
      if (!allowed.includes(location.pathname)) throw redirect({ to: homeForRoles(roles) });
    }
    return { user: data.user, roles };
  },
  component: Layout,
});

function Layout() {
  const { roles } = Route.useRouteContext();
  return (
    <AppShell roles={roles}>
      <Outlet />
    </AppShell>
  );
}
