import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { canAccessPath, homeForRoles, isManager } from "@/lib/roles";
import { checkDeviceSession, forceSignOut } from "@/lib/device-session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const [reason, rolesRes, activeRes] = await Promise.all([
      checkDeviceSession(),
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
      supabase.rpc("is_active_account", { _user_id: data.user.id }),
    ]);
    if (reason) {
      await forceSignOut(reason);
      throw redirect({ to: "/auth" });
    }
    if (rolesRes.error) {
      await forceSignOut("অ্যাক্সেস যাচাই করা যায়নি। আবার লগইন করুন।");
      throw redirect({ to: "/auth" });
    }
    const roles = (rolesRes.data ?? []).map((r) => r.role as string);
    if (roles.length === 0) throw redirect({ to: "/portal" });
    if (!canAccessPath(location.pathname, roles)) throw redirect({ to: homeForRoles(roles) });
    if (!isManager(roles)) {
      const active = activeRes.data;
      if (active === false) {
        await supabase.auth.signOut();
        throw redirect({ to: "/auth" });
      }
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
