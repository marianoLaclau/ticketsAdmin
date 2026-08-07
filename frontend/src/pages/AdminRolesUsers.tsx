import { ShieldCheck, UsersRound } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminRolesTab } from "@/features/admin-directory/AdminRolesTab";
import { AdminUsersTab } from "@/features/admin-directory/AdminUsersTab";
import { useAdminDirectoryUrl } from "@/features/admin-directory/useAdminDirectoryUrl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminAccess } from "@/hooks/use-admin-access";

export default function AdminRolesUsers() {
  const { adminKey, saveAdminKey, adminRequest } = useAdminAccess();
  const { urlState, updateUsersUrlState, selectTab } = useAdminDirectoryUrl();

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-8">
      <AdminHeader
        title="Roles y usuarios"
        description="Administración de perfiles operativos, permisos previstos y estado de acceso."
        adminKey={adminKey}
        onAdminKeyChange={saveAdminKey}
      />

      <Tabs
        value={urlState.tab}
        onValueChange={selectTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <UsersRound className="h-3.5 w-3.5" /> Usuarios
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Roles
          </TabsTrigger>
        </TabsList>

        <AdminUsersTab
          request={adminRequest}
          urlState={urlState.users}
          updateUrlState={updateUsersUrlState}
        />
        <AdminRolesTab request={adminRequest} />
      </Tabs>
    </div>
  );
}
