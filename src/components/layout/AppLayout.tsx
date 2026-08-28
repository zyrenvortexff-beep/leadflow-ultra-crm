import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Users,
  Megaphone,
  Smartphone,
  Shield,
  LogOut,
  Contact as ContactIcon,
  Briefcase,
  AlertTriangle,
  GraduationCap,
  UsersRound,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
};

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/whatsapp", label: "WhatsApp Hub", icon: Smartphone },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/contacts", label: "Contactos", icon: ContactIcon },
  { to: "/groups", label: "Grupos WhatsApp", icon: UsersRound },
  { to: "/automations", label: "Automatizaciones", icon: Bot },
  { to: "/campaigns", label: "Campañas", icon: Megaphone },
  { to: "/messages", label: "Mensajes", icon: MessageSquare },
  { to: "https://tutometa.space-z.ai", label: "TUTORIA DE META", icon: GraduationCap, external: true },
  { to: "/errors", label: "Logs de Error", icon: AlertTriangle },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, organization, signOut, isSuperadmin, roles } = useAuth();
  const isAgent = roles.includes("agent");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("leadflow-theme") as "dark" | "light" | null;
    const initial = saved || "dark";
    setTheme(initial);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("leadflow-theme", next);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(next);
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {
      // ignore — we still want to leave the app
    }
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex transition-colors duration-200">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-sidebar/80 backdrop-blur-xl flex flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <Link to="/dashboard" className="block min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gradient tracking-tight truncate">LeadFlow Ultra</h1>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {organization?.name ?? "Cargando..."}
            </p>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground shrink-0 ml-2"
            title={theme === "dark" ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </Button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {nav.map((item) => {
            const active = !item.external && pathname.startsWith(item.to);
            const Icon = item.icon;
            if (item.external) {
              return (
                <a
                  key={item.to}
                  href={item.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </a>
              );
            }
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-primary/15 text-primary glow-blue"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {isSuperadmin && (
            <>
              <div className="pt-4 pb-2 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                Superadmin
              </div>
              <Link
                to="/superadmin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  pathname.startsWith("/superadmin")
                    ? "bg-accent/15 text-accent glow-violet"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Shield className="w-4 h-4" />
                <span>Panel Maestro</span>
              </Link>
            </>
          )}
          {(isAgent || isSuperadmin) && (
            <>
              <div className="pt-4 pb-2 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                Revendedor
              </div>
              <Link
                to="/agent"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  pathname.startsWith("/agent")
                    ? "bg-primary/15 text-primary glow-blue"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Briefcase className="w-4 h-4" />
                <span>Panel Agente</span>
              </Link>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-xs font-bold text-background">
              {(profile?.full_name ?? "U").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name ?? "Usuario"}</p>
              <p className="text-xs truncate">
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider",
                    organization?.plan_type === "elite" && "bg-accent/20 text-accent",
                    organization?.plan_type === "pro" && "bg-success/20 text-success",
                    organization?.plan_type === "vip" && "bg-primary/20 text-primary",
                    (!organization?.plan_type || organization.plan_type === "trial") && "bg-muted text-muted-foreground",
                  )}
                >
                  Licencia {organization?.plan_type?.toUpperCase() ?? "TRIAL"}
                </span>
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
          <Link
            to="/legal"
            className="block text-center text-[11px] text-muted-foreground hover:text-primary transition-colors pt-1"
          >
            Legal & Términos
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div
          className="min-h-full"
          style={{
            backgroundImage:
              "radial-gradient(800px circle at 0% 0%, color-mix(in oklab, var(--neon-blue) 10%, transparent), transparent 50%), radial-gradient(600px circle at 100% 100%, color-mix(in oklab, var(--neon-violet) 8%, transparent), transparent 50%)",
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-8 gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function BackToDashboard() {
  return (
    <Link
      to="/dashboard"
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4 transition-colors"
    >
      ← Volver al Dashboard
    </Link>
  );
}