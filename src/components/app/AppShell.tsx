import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BarChart3, CalendarDays, ClipboardCheck, Home, LogOut, Settings, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const nav = [
  { to: "/dashboard", label: "হোম", icon: Home },
  { to: "/candidates", label: "পরীক্ষার্থী", icon: Users },
  { to: "/exams", label: "পরীক্ষা", icon: CalendarDays },
  { to: "/results", label: "রেজাল্ট", icon: ClipboardCheck, desktopOnly: true },
  { to: "/reports", label: "রিপোর্ট", icon: BarChart3 },
  { to: "/submit-job", label: "কাজ Submit", icon: ClipboardCheck, desktopOnly: true },
  { to: "/settings", label: "সেটিংস", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logout = async () => {
    await supabase.auth.signOut();
    qc.clear();
    navigate({ to: "/auth" });
  };
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">প</div>
          <div className="font-display text-lg font-bold leading-tight">পরীক্ষা<br /><span className="text-sm font-medium text-muted-foreground">ম্যানেজমেন্ট</span></div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
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

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card md:hidden">
        {nav.filter((n) => !("desktopOnly" in n)).map((n) => (
          <Link
            key={n.to}
            to={n.to}
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
