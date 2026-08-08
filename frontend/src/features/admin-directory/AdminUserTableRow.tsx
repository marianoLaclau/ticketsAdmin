import type { AdminUser } from "@workspace/api-client-react";
import { KeyRound, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { AdminStatusBadge } from "@/features/admin-directory/AdminStatusBadge";
import { formatDate } from "@/lib/utils-tickets";

interface AdminUserTableRowProps {
  user: AdminUser;
  roleName?: string | undefined;
  isStatusToggleDisabled: boolean;
  isEditDisabled: boolean;
  isPasswordResetDisabled: boolean;
  onToggle: (user: AdminUser) => void;
  onEdit: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
}

export function AdminUserTableRow({
  user,
  roleName,
  isStatusToggleDisabled,
  isEditDisabled,
  isPasswordResetDisabled,
  onToggle,
  onEdit,
  onResetPassword,
}: AdminUserTableRowProps) {
  const userLabel = user.username ?? user.email;

  return (
    <TableRow>
      <TableCell className="tabular-nums text-muted-foreground">
        {user.id}
      </TableCell>
      <TableCell className="font-medium">
        {user.nombre} {user.apellido ?? ""}
      </TableCell>
      <TableCell>
        <div className="font-mono text-xs text-slate-600">
          {user.username ?? "—"}
        </div>
        {user.debe_cambiar_password && (
          <Badge
            variant="outline"
            className="mt-1 border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-700"
          >
            Cambio de contraseña pendiente
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Badge variant="outline">{roleName ?? `Rol #${user.role_id}`}</Badge>
      </TableCell>
      <TableCell>
        <AdminStatusBadge active={user.activo} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDate(user.fecha_actualizacion)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Switch
            checked={user.activo}
            onCheckedChange={() => onToggle(user)}
            disabled={isStatusToggleDisabled}
            aria-label={
              user.activo
                ? `Desactivar usuario ${userLabel}`
                : `Activar usuario ${userLabel}`
            }
            title={user.activo ? "Desactivar usuario" : "Activar usuario"}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(user)}
            disabled={isEditDisabled}
            title="Editar usuario"
            aria-label={`Editar usuario ${userLabel}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-amber-600 hover:text-amber-700"
            onClick={() => onResetPassword(user)}
            disabled={isPasswordResetDisabled}
            title="Asignar contraseña temporal"
            aria-label={`Asignar contraseña temporal a ${userLabel}`}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
