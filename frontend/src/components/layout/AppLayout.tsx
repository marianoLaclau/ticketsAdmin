import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast as showToast } from "@/hooks/use-toast";
import { getContactDisplayName } from "@/lib/contacto";
import {
  isSessionRevokedEvent,
  parseRealtimeEvent,
} from "@/lib/realtime-events";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";
import { clearRevokedSessionState } from "@/lib/session-state";
import { Sidebar } from "@/components/layout/Sidebar";
import gsbLogo from "@/assets/gsb-logo.jpg";

/**
 * Escucha los eventos del backend (SSE) y refresca los datos en el momento
 * exacto en que entra un llamado nuevo — sin recargar la página ni depender
 * del polling. Si la conexión se corta, el navegador la reintenta solo, salvo
 * cuando el backend informa una revocación definitiva de la sesión.
 */
function useEventosEnVivo() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      const data = parseRealtimeEvent(e.data);
      if (!data) return;

      if (isSessionRevokedEvent(data)) {
        // Evita que EventSource intente reconectar con una cookie que el
        // servidor ya invalidó. La raíz revalida desde cero la cookie actual:
        // normalmente mostrará el login y, si otra pestaña ya inició una
        // sesión válida, montará también un EventSource nuevo.
        es.close();
        clearRevokedSessionState(queryClient);
        showToast({
          dedupeKey: "session-revoked",
          variant: "warning",
          title: "Sesión finalizada",
          description:
            "Tus permisos o credenciales cambiaron. Volvé a iniciar sesión.",
        });
        navigate("/", { replace: true });
        return;
      }

      // Los eventos funcionales sólo afectan tickets y estadísticas. Sesión,
      // llave administrativa, usuarios y roles conservan su caché vigente.
      void invalidateTicketDomainQueries(queryClient);
      if (data.tipo === "ticket_creado") {
        const contacto = getContactDisplayName(data);
        showToast({
          ...(data.ticket_id
            ? { dedupeKey: `ticket-created:${data.ticket_id}` }
            : {}),
          variant: "info",
          title: "Nuevo llamado recibido",
          description: [contacto, data.motivo || null]
            .filter(Boolean)
            .join(" — "),
        });
      } else if (data.tipo === "tickets_importados") {
        const cantidad = data.cantidad ?? 0;
        showToast({
          dedupeKey: `tickets-imported:${data.cantidad_total ?? cantidad}`,
          variant: "info",
          title: "Importación disponible",
          description: `${cantidad} ${cantidad === 1 ? "llamado nuevo" : "llamados nuevos"} en el listado.`,
        });
      }
    };
    return () => es.close();
  }, [navigate, queryClient]);
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  useEventosEnVivo();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    const desktopViewport = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };

    desktopViewport.addEventListener("change", closeOnDesktop);
    return () => desktopViewport.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-background font-sans">
      <div className="hidden h-full lg:flex">
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b bg-background px-4 lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm ring-1 ring-black/5">
              <img
                src={gsbLogo}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                Sistema de Tickets
              </p>
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                GSB Quality Services
              </p>
            </div>
          </div>

          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Abrir menú principal"
                aria-expanded={mobileOpen}
              >
                <Menu aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent
              placement="left"
              className="w-[min(85vw,240px)] max-w-none bg-sidebar text-sidebar-foreground [&>button]:z-10 [&>button]:text-sidebar-foreground [&>button]:hover:bg-sidebar-accent"
            >
              <DialogTitle className="sr-only">
                Navegación principal
              </DialogTitle>
              <DialogDescription className="sr-only">
                Accesos al dashboard, tickets y administración según tus
                permisos.
              </DialogDescription>
              <Sidebar
                className="w-full border-r-0"
                onNavigate={() => setMobileOpen(false)}
                testIdPrefix="mobile-"
              />
            </DialogContent>
          </Dialog>
        </header>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
