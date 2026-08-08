import type { AdminRole } from "@workspace/api-client-react";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { AdminStatusBadge } from "@/features/admin-directory/AdminStatusBadge";
import { formatDate } from "@/lib/utils-tickets";

interface AdminRoleTableRowProps {
  role: AdminRole;
  isSystemRole: boolean;
  isMutationPending: boolean;
  onToggle: (role: AdminRole) => void;
  onEdit: (role: AdminRole) => void;
  onDelete: (role: AdminRole) => void;
}

export function AdminRoleTableRow({
  role,
  isSystemRole,
  isMutationPending,
  onToggle,
  onEdit,
  onDelete,
}: AdminRoleTableRowProps) {
  return (
    <TableRow>
      <TableCell className="tabular-nums text-muted-foreground">
        {role.id}
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex flex-wrap items-center gap-2">
          <span>{role.nombre}</span>
          {isSystemRole && (
            <Badge
              variant="outline"
              className="text-[10px] font-medium uppercase tracking-wide"
            >
              Sistema protegido
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-xl text-muted-foreground">
        {role.descripcion || "—"}
      </TableCell>
      <TableCell>
        <AdminStatusBadge active={role.activo} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDate(role.fecha_actualizacion)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Switch
            checked={role.activo}
            onCheckedChange={() => onToggle(role)}
            disabled={isMutationPending || isSystemRole}
            aria-label={
              isSystemRole
                ? `${role.nombre}: rol del sistema protegido, permanece activo`
                : role.activo
                  ? `Desactivar rol ${role.nombre}`
                  : `Activar rol ${role.nombre}`
            }
            title={
              isSystemRole
                ? "Los roles del sistema deben permanecer activos"
                : role.activo
                  ? "Desactivar rol"
                  : "Activar rol"
            }
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(role)}
            disabled={isMutationPending}
            title="Editar rol"
            aria-label={`Editar rol ${role.nombre}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-600 hover:text-red-700"
            onClick={() => onDelete(role)}
            disabled={isMutationPending || isSystemRole}
            aria-label={
              isSystemRole
                ? `${role.nombre}: rol del sistema protegido, no se puede eliminar`
                : `Eliminar rol ${role.nombre}`
            }
            title={
              isSystemRole
                ? "Los roles del sistema no se pueden eliminar"
                : "Eliminar rol"
            }
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
