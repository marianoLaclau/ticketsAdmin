import { useMemo } from "react";
import { AlertTriangle, Database, Upload } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminCsvImportTab } from "@/features/admin-tickets/AdminCsvImportTab";
import { AdminDangerZoneTab } from "@/features/admin-tickets/AdminDangerZoneTab";
import { AdminTicketsTab } from "@/features/admin-tickets/AdminTicketsTab";
import { useAdminTicketsUrl } from "@/features/admin-tickets/useAdminTicketsUrl";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { createAdminTicketDetailNavigationState } from "@/lib/ticket-navigation";

let adminTicketsQueryVersion = 0;

function nextAdminTicketsQueryVersion(): number {
  adminTicketsQueryVersion += 1;
  return adminTicketsQueryVersion;
}

export default function Admin() {
  // Segunda credencial obligatoria para las operaciones del panel SysAdmin.
  const { adminKey, saveAdminKey, adminRequest } = useAdminAccess();
  const { urlState, canonicalSearch, updateUrlState, selectTab } =
    useAdminTicketsUrl();
  const detailNavigationState = useMemo(
    () => createAdminTicketDetailNavigationState(canonicalSearch),
    [canonicalSearch],
  );
  // La versión fuerza una consulta nueva cuando cambia la llave, sin incluir
  // el secreto en el query key ni dejarlo expuesto en la caché del navegador.
  const adminAccessVersion = useMemo(nextAdminTicketsQueryVersion, [adminKey]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 md:p-8">
      <AdminHeader
        title="Administración"
        description="Gestión directa de la base de datos: registros, importación masiva y mantenimiento."
        adminKey={adminKey}
        onAdminKeyChange={saveAdminKey}
      />

      <Tabs value={urlState.tab} onValueChange={selectTab}>
        <TabsList>
          <TabsTrigger value="registros" className="gap-1.5">
            <Database className="h-3.5 w-3.5" /> Registros
          </TabsTrigger>
          <TabsTrigger value="importar" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Importar CSV
          </TabsTrigger>
          <TabsTrigger
            value="peligro"
            className="gap-1.5 data-[state=active]:text-red-600"
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Zona peligrosa
          </TabsTrigger>
        </TabsList>

        <AdminTicketsTab
          request={adminRequest}
          hasAdminAccess={Boolean(adminKey)}
          accessVersion={adminAccessVersion}
          urlState={urlState}
          updateUrlState={updateUrlState}
          detailNavigationState={detailNavigationState}
        />
        <AdminCsvImportTab request={adminRequest} />
        <AdminDangerZoneTab
          request={adminRequest}
          hasAdminAccess={Boolean(adminKey)}
          accessVersion={adminAccessVersion}
        />
      </Tabs>
    </div>
  );
}
