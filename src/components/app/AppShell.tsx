import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Briefcase, BarChart3, CalendarDays, ClipboardCheck, Home, LogOut, Settings, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { TechBackground } from "./TechBackground";

const nav = [
  { to: "/dashboard", label: "হোম", icon: Home },
  { to: "/candidates", label: "পরীক্ষার্থী", icon: Users },
  { to: "/exams", label: "পরীক্ষা", icon: CalendarDays },
  { to: "/results", label: "রেজাল্ট", icon: ClipboardCheck, desktopOnly: true },
  { to: "/reports", label: "রিপোর্ট", icon: BarChart3 },
  { to: "/submissions", label: "Submitted Works", icon: ClipboardCheck, desktopOnly: true },
  { to: "/accounts", label: "এজেন্ট/প্রোভাইডার", icon: Users, desktopOnly: true },
  { to: "/management", label: "রিসেপশন", icon: UserCheck, desktopOnly: true },
  { to: "/settings", label: "সেটিংস", icon: Settings },
] as const;
const agentNav = [
  { to: "/dashboard", label: "ড্যাশবোর্ড", icon: Home },
  { to: "/submit-job", label: "Submit Work", icon: ClipboardCheck },
  { to: "/my-works", label: "আমার কাজ", icon: Briefcase },
] as const;
const providerNav = [{ to: "/provider", label: "আমার কাজ", icon: Briefcase }] as const;
const managementNav = [{ to: "/management", label: "রিসেপশন", icon: UserCheck }] as const;

export function AppShell({ children, roles = [] }: { children: ReactNode; roles?: string[] }) {
  const manager = roles.includes("admin") || roles.includes("staff");
  const items: readonly { to: string; label: string; icon: typeof Home; desktopOnly?: boolean }[] = manager ? nav : [...(roles.includes("agent") ? agentNav : []), ...(roles.includes("service_provider") ? providerNav : []), ...(roles.includes("management") ? managementNav : [])];
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logout = async () => {
    await supabase.auth.signOut();
    qc.clear();
    navigate({ to: "/auth" });
  };
  return (
    <div className="relative isolate min-h-screen md:flex">
      <TechBackground />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar/85 p-4 backdrop-blur-md md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">প</div>
          <div className="font-display text-lg font-bold leading-tight">পরীক্ষা<br /><span className="text-sm font-medium text-muted-foreground">ম্যানেজমেন্ট</span></div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((n) => (
            <Link
              key={n.to}
              to={n.to as "/dashboard"}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted">
          <LogOut className="h-4 w-4" /> লগআউট
        </button>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>

       <nav className={`fixed inset-x-0 bottom-0 z-40 grid ${manager ? "grid-cols-5" : ["grid-cols-1","grid-cols-1","grid-cols-2","grid-cols-3","grid-cols-4"][Math.min(items.length,4)]} border-t bg-card md:hidden`}>
        {items.filter((n) => !n.desktopOnly).map((n) => (
          <Link
            key={n.to}
            to={n.to as "/dashboard"}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
            activeProps={{ className: "text-primary font-semibold" }}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
