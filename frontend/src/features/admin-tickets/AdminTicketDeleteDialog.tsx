import type { Ticket } from "@workspace/api-client-react";
import { getContactDisplayName } from "@/lib/contacto";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AdminTicketDeleteDialogProps {
  ticket: Ticket | null;
  isDeleting: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}

export function AdminTicketDeleteDialog({
  ticket,
  isDeleting,
  onDismiss,
  onConfirm,
}: AdminTicketDeleteDialogProps) {
  return (
    <AlertDialog
      open={ticket !== null}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
          <AlertDialogDescription>
            Se va a eliminar el registro de{" "}
            <strong>{getContactDisplayName(ticket)}</strong> ({ticket?.motivo})
            junto con todos sus seguimientos. No se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
