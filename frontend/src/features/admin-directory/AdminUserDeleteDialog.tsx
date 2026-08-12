import { useEffect, useState } from "react";
import type { AdminUser } from "@workspace/api-client-react";
import { AlertTriangle, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AdminUserDeleteDialogProps {
  user: AdminUser | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (username: string) => void;
}

/**
 * Segunda aprobación del borrado: escribir el nombre de usuario exacto.
 *
 * El backend exige lo mismo, así que esto no es solo una traba visual: un id
 * equivocado no puede eliminar a otra persona aunque se saltee esta pantalla.
 */
export function AdminUserDeleteDialog({
  user,
  isPending,
  onOpenChange,
  onConfirm,
}: AdminUserDeleteDialogProps) {
  const [confirmacion, setConfirmacion] = useState("");
  const esperado = user?.username ?? "";

  // Cada apertura arranca vacía: no se hereda lo tipeado para otra cuenta.
  useEffect(() => {
    if (user) setConfirmacion("");
  }, [user]);

  const coincide =
    confirmacion.trim().toLocaleLowerCase() === esperado.toLocaleLowerCase() &&
    esperado.length > 0;

  return (
    <AlertDialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Eliminar definitivamente a “{esperado}”?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Esta acción no se puede deshacer. Se borra la cuenta y se
                cierran sus sesiones abiertas.
              </p>
              <p>
                El historial se conserva: los tickets y seguimientos que
                gestionó quedan con su nombre registrado, pero sin vínculo a una
                cuenta.
              </p>
              <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-amber-800">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Si solo querés impedirle el acceso, desactivá la cuenta con el
                  interruptor: conserva la identidad y es reversible.
                </span>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="confirmar-eliminacion-usuario">
            Escribí <span className="font-mono font-semibold">{esperado}</span>{" "}
            para confirmar
          </Label>
          <Input
            id="confirmar-eliminacion-usuario"
            value={confirmacion}
            onChange={(event) => setConfirmacion(event.target.value)}
            autoComplete="off"
            aria-invalid={confirmacion.length > 0 && !coincide}
            disabled={isPending}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Sin coincidencia el diálogo no debe cerrarse ni disparar nada.
              if (!coincide) {
                event.preventDefault();
                return;
              }
              onConfirm(esperado);
            }}
            disabled={!coincide || isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending && (
              <Loader2
                className="mr-1.5 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            Eliminar usuario
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
