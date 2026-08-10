import { useMemo } from "react";
import { AlertTriangle, Database, Upload } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminCsvImportTab } from "@/features/admin-tickets/AdminCsvImportTab";
import { AdminDangerZoneTab } from "@/features/admin-tickets/AdminDangerZoneTab";
import { AdminTicketsTab } from "@/features/admin-tickets/AdminTicketsTab";
import { useAdminTicketsUrl } from "@/features/admin-tickets/useAdminTicketsUrl";
import { useAdminElevation } from "@/hooks/use-admin-elevation";
import { createAdminTicketDetailNavigationState } from "@/lib/ticket-navigation";

export default function Admin() {
  const adminElevation = useAdminElevation();
  const { urlState, canonicalSearch, updateUrlState, selectTab } =
    useAdminTicketsUrl();
  const detailNavigationState = useMemo(
    () => createAdminTicketDetailNavigationState(canonicalSearch),
    [canonicalSearch],
  );
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 md:p-8">
      <AdminHeader
        title="Administración"
        description="Gestión directa de la base de datos: registros, importación masiva y mantenimiento."
        state={adminElevation.state}
        expiresAt={adminElevation.expiresAt}
        error={adminElevation.error}
        action={adminElevation.action}
        onElevate={adminElevation.elevate}
        onRevoke={adminElevation.revoke}
      />

      <Tabs value={urlState.tab} onValueChange={selectTab}>
        <TabsList
          className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3 md:inline-grid md:w-auto"
          aria-label="Herramientas de administración de tickets"
        >
          <TabsTrigger value="registros" className="min-h-10 gap-1.5">
            <Database className="h-3.5 w-3.5" aria-hidden="true" /> Registros
          </TabsTrigger>
          <TabsTrigger value="importar" className="min-h-10 gap-1.5">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Importar CSV
          </TabsTrigger>
          <TabsTrigger
            value="peligro"
            className="min-h-10 gap-1.5 data-[state=active]:text-red-600"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Zona
            peligrosa
          </TabsTrigger>
        </TabsList>

        <AdminTicketsTab
          request={adminElevation.adminRequest}
          queryRequest={adminElevation.adminRequest}
          adminAccessState={adminElevation.state}
          accessVersion={adminElevation.accessVersion}
          accessGeneration={adminElevation.accessGeneration}
          urlState={urlState}
          updateUrlState={updateUrlState}
          detailNavigationState={detailNavigationState}
        />
        <AdminCsvImportTab
          request={adminElevation.adminRequest}
          adminAccessState={adminElevation.state}
          accessVersion={adminElevation.accessVersion}
          accessGeneration={adminElevation.accessGeneration}
        />
        <AdminDangerZoneTab
          request={adminElevation.adminRequest}
          queryRequest={adminElevation.adminRequest}
          adminAccessState={adminElevation.state}
          accessVersion={adminElevation.accessVersion}
          accessGeneration={adminElevation.accessGeneration}
        />
      </Tabs>
    </div>
  );
}
