import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CalendarDays,
  Map,
  Wrench,
  Users,
  UserCog,
  Star,
  FileText,
  Menu,
  Droplets,
  Bell,
  UserSearch,
  CalendarRange,
  CheckSquare,
  PhoneIncoming,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/weekly", label: "Weekly", icon: CalendarDays },
  { href: "/canvassing", label: "Canvassing", icon: Map },
  { href: "/leads", label: "Leads", icon: UserSearch },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/calendar", label: "Schedule", icon: CalendarRange },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/reviews", label: "Reviews", icon: Star },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/calls", label: "Calls", icon: PhoneIncoming },
  { href: "/users", label: "Team", icon: UserCog },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const currentLabel = navItems.find((i) => i.href === location)?.label || "Dashboard";

  return (
    <div className="h-screen bg-background flex w-full overflow-hidden">
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile, static on md+ */}
      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200/60 flex flex-col shadow-sm transition-transform duration-300 ease-in-out md:translate-x-0 shrink-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-100 shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
          <Droplets className="w-7 h-7 text-primary relative z-10 shrink-0" />
          <span className="ml-2.5 font-display font-bold text-lg tracking-tight text-slate-900 relative z-10">
            Healthy<span className="text-primary">Home</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "flex items-center px-3 py-3 rounded-xl font-medium transition-all duration-200 group relative text-sm",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
                )}
                <item.icon
                  className={cn(
                    "w-4 h-4 mr-3 shrink-0 transition-colors",
                    isActive ? "text-primary" : "text-slate-400 group-hover:text-primary/70"
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-emerald-400 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0">
              JD
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">John Doe</p>
              <p className="text-xs text-slate-500">Owner</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white/80 backdrop-blur-sm border-b border-slate-200/60 flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — only on mobile (hidden on md+) */}
            <button
              onClick={() => setIsMobileOpen(true)}
              className="p-2 -ml-1 text-slate-500 hover:text-slate-900 md:hidden rounded-lg hover:bg-slate-100 transition-colors shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base md:text-xl font-display font-bold text-slate-800 tracking-tight truncate">
              {currentLabel}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-400 hover:text-primary bg-slate-50 hover:bg-primary/5 rounded-full transition-all relative">
              <Bell className="w-4 h-4 md:w-5 md:h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
          </div>
        </header>

        {/* Page content — scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 md:p-6 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
