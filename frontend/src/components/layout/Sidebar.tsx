import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Ticket,
  UserCircle,
  Settings,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import {
  useGetDashboardStats,
  getGetDashboardStatsQueryKey,
  useGetMe,
  getGetMeQueryKey,
  useLogout,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ROL_SYSADMIN } from "@/lib/roles";
import { getEstadoLabel } from "@/lib/estados";
import { getUserErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import gsbLogo from "@/assets/gsb-logo.jpg";

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
  testIdPrefix?: string;
}

export function Sidebar({
  className,
  onNavigate,
  testIdPrefix = "",
}: SidebarProps) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Refresco periódico para que el badge de nuevos funcione como notificación
  const { data: stats } = useGetDashboardStats(undefined, {
    query: {
      queryKey: getGetDashboardStatsQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const { data: me } = useGetMe({
    query: { queryKey: getGetMeQueryKey() },
  });
  const logout = useLogout();

  const handleLogout = () => {
    if (logout.isPending) return;

    logout.mutate(undefined as never, {
      onSuccess: () => {
        // La caché de datos sí es propia de la sesión. La llave administrativa
        // persiste en el navegador, separada por usuario, para no pedirla en
        // cada ingreso al panel.
        queryClient.clear();
        onNavigate?.();
        // La recarga completa descarta cualquier árbol autenticado todavía
        // montado y obliga a verificar la cookie ya eliminada por el backend.
        window.location.replace(import.meta.env.BASE_URL);
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "No se pudo cerrar la sesión",
          description: getUserErrorMessage(
            error,
            "Reintentá en unos segundos. Tu sesión continúa abierta.",
          ),
        });
      },
    });
  };

  const nuevosSinAbrir =
    stats?.por_estado?.find((e) => e.estado === "nuevo")?.cantidad ?? 0;

  // El acceso a Administración solo existe para el rol SysAdmin (el backend
  // lo valida igual; esto es para que los demás ni siquiera lo vean).
  const esSysAdmin = me?.rol === ROL_SYSADMIN;
  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tickets", label: "Tickets", icon: Ticket },
    ...(esSysAdmin
      ? [{ href: "/admin", label: "Administración", icon: Settings }]
      : []),
  ];

  return (
    <aside
      className={cn(
        "flex h-full w-[240px] flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex h-36 flex-shrink-0 flex-col items-center justify-center border-b border-sidebar-border/50 px-4 py-3">
        <div className="rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-black/5">
          <img
            src={gsbLogo}
            alt="GSB Quality Services"
            className="h-24 w-24 object-contain"
          />
        </div>
        <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/60">
          Sistema de Tickets
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <nav aria-label="Navegación principal" className="space-y-1.5 px-3">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive =
              location === link.href || location.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={`group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-all ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary border-l-2 border-sidebar-primary -ml-[2px] pl-[14px]"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
                data-testid={`${testIdPrefix}nav-link-${link.label.toLowerCase().replace(" ", "-")}`}
              >
                <div className="flex items-center">
                  <Icon
                    className={`mr-3 h-[18px] w-[18px] flex-shrink-0 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"}`}
                  />
                  {link.label}
                </div>

                {link.href === "/admin" && (
                  <ShieldCheck
                    className="h-4 w-4 flex-shrink-0 text-sidebar-foreground/60"
                    aria-label="Acceso administrativo"
                  />
                )}

                {link.href === "/tickets" && (
                  <span className="flex items-center gap-1.5">
                    {nuevosSinAbrir > 0 && (
                      <span
                        className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold"
                        title={`${nuevosSinAbrir} tickets nuevos sin abrir`}
                      >
                        {nuevosSinAbrir}
                      </span>
                    )}
                    {stats?.vencidos && stats.vencidos > 0 ? (
                      <span
                        className="bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full text-[10px] font-bold"
                        title={`${stats.vencidos} tickets vencidos`}
                      >
                        {stats.vencidos}
                      </span>
                    ) : null}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="px-5 py-5 border-t border-sidebar-border/50">
        <h3 className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-semibold mb-3">
          Estado Actual
        </h3>
        <div className="space-y-2.5">
          <div className="flex justify-between items-center text-sm">
            <span className="text-sidebar-foreground/80">Total</span>
            <span className="font-semibold">{stats?.total || 0}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-sidebar-foreground/80">En proceso</span>
            <span className="font-semibold text-blue-400">
              {stats?.por_estado?.find((e) => e.estado === "en_proceso")
                ?.cantidad || 0}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="max-w-[150px] text-xs leading-tight text-sidebar-foreground/80">
              {getEstadoLabel("pendiente")}
            </span>
            <span className="font-semibold text-amber-400">
              {stats?.por_estado?.find((e) => e.estado === "pendiente")
                ?.cantidad || 0}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-sidebar-foreground/80">Urgentes</span>
            <span className="font-semibold text-red-400">
              {stats?.por_prioridad?.find((p) => p.prioridad === "urgente")
                ?.cantidad || 0}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-sidebar-border/50 bg-sidebar-accent/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-sidebar-border flex items-center justify-center flex-shrink-0">
            <UserCircle className="h-5 w-5 text-sidebar-foreground/70" />
          </div>
          <div className="overflow-hidden flex-1">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">
              {me ? [me.nombre, me.apellido].filter(Boolean).join(" ") : "..."}
            </p>
            <p className="text-[10px] text-sidebar-foreground/60 truncate">
              {me?.rol ?? ""}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="h-8 w-8 rounded-md flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid={`${testIdPrefix}logout-button`}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 border-t border-sidebar-border/50 pt-2 text-center">
          <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/40">
            GSB IT - V0.5
          </p>
        </div>
      </div>
    </aside>
  );
}
