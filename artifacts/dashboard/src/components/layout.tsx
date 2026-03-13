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
  X,
  Droplets,
  Bell
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/weekly", label: "Weekly", icon: CalendarDays },
  { href: "/canvassing", label: "Canvassing", icon: Map },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/reviews", label: "Reviews", icon: Star },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/users", label: "Team", icon: UserCog },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex w-full overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200/60 transform transition-transform duration-300 ease-in-out lg:transform-none flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-20 flex items-center px-8 border-b border-slate-100 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
          <Droplets className="w-8 h-8 text-primary relative z-10" />
          <span className="ml-3 font-display font-bold text-xl tracking-tight text-slate-900 relative z-10">
            Healthy<span className="text-primary">Home</span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "flex items-center px-4 py-3.5 rounded-xl font-medium transition-all duration-200 group relative",
                  isActive 
                    ? "text-primary bg-primary/10" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                )}
                <item.icon className={cn(
                  "w-5 h-5 mr-3 transition-colors",
                  isActive ? "text-primary" : "text-slate-400 group-hover:text-primary/70"
                )} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-6 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-emerald-400 flex items-center justify-center text-white font-bold shadow-md shadow-primary/20">
              JD
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">John Doe</p>
              <p className="text-xs text-slate-500">Owner</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 max-h-screen overflow-hidden relative">
        {/* Topbar */}
        <header className="h-20 glass-panel border-b border-slate-200/50 flex items-center justify-between px-6 lg:px-10 sticky top-0 z-30">
          <div className="flex items-center">
            <button 
              onClick={() => setIsMobileOpen(true)}
              className="p-2 -ml-2 mr-4 text-slate-500 hover:text-slate-900 lg:hidden rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg sm:text-2xl font-display font-bold text-slate-800 tracking-tight">
              {navItems.find(i => i.href === location)?.label || "Dashboard"}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2.5 text-slate-400 hover:text-primary bg-slate-50 hover:bg-primary/5 rounded-full transition-all relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-10 relative">
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-primary/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/3 mix-blend-multiply" />
          
          <div className="max-w-7xl mx-auto relative z-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
