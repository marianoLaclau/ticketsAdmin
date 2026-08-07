import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast as showToast } from "@/hooks/use-toast";
import { getContactDisplayName } from "@/lib/contacto";
import {
  isSessionRevokedEvent,
  parseRealtimeEvent,
} from "@/lib/realtime-events";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";
import { clearRevokedSessionState } from "@/lib/session-state";
import { Sidebar } from "@/components/layout/Sidebar";

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

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col bg-background">
        {children}
      </main>
    </div>
  );
}
