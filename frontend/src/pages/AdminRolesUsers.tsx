import { ShieldCheck, UsersRound } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminRolesTab } from "@/features/admin-directory/AdminRolesTab";
import { AdminUsersTab } from "@/features/admin-directory/AdminUsersTab";
import { useAdminDirectoryUrl } from "@/features/admin-directory/useAdminDirectoryUrl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminRolesUsers() {
  const { urlState, updateUsersUrlState, updateRolesUrlState, selectTab } =
    useAdminDirectoryUrl();
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
      <AdminHeader
        title="Roles y usuarios"
        description="Administración de perfiles operativos, permisos previstos y estado de acceso."
      />

      <Tabs
        value={urlState.tab}
        onValueChange={selectTab}
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 sm:inline-flex sm:w-auto">
          <TabsTrigger
            value="users"
            className="w-full gap-1.5 py-2 sm:w-auto sm:py-1"
          >
            <UsersRound className="h-3.5 w-3.5" aria-hidden="true" /> Usuarios
          </TabsTrigger>
          <TabsTrigger
            value="roles"
            className="w-full gap-1.5 py-2 sm:w-auto sm:py-1"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Roles
          </TabsTrigger>
        </TabsList>

        <AdminUsersTab
          urlState={urlState.users}
          updateUrlState={updateUsersUrlState}
        />
        <AdminRolesTab
          urlState={urlState.roles}
          updateUrlState={updateRolesUrlState}
        />
      </Tabs>
    </div>
  );
}
