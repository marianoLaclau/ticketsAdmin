import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListTicketsQueryKey,
  useListTickets,
  useTruncateTickets,
} from "@workspace/api-client-react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { useToast } from "@/hooks/use-toast";
import { getAdminErrorMessage } from "@/lib/error-messages";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";

export function AdminDangerZoneTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isCurrentOperation = useAdminOperationGuard();
  const totalBaseParams = { page: 1, limit: 1, incluir_vacios: true };
  const totalBaseQuery = useListTickets(totalBaseParams, {
    query: {
      queryKey: [...getListTicketsQueryKey(totalBaseParams)],
      retry: false,
    },
  });
  const truncate = useTruncateTickets();
  const [confirmTexto, setConfirmTexto] = useState("");

  const refrescarTickets = () => invalidateTicketDomainQueries(queryClient);

  const errorToast = (title: string) => (err: unknown) => {
    if (!isCurrentOperation()) return;
    toast({
      variant: "destructive",
      title,
      description: getAdminErrorMessage(err),
    });
  };

  const ejecutarTruncate = () => {
    if (
      !isCurrentOperation() ||
      confirmTexto !== "BORRAR" ||
      truncate.isPending
    )
      return;
    truncate.mutate(
      { data: { confirmar: true } },
      {
        onSuccess: (r) => {
          if (!isCurrentOperation()) return;
          setConfirmTexto("");
          void refrescarTickets();
          toast({
            variant: "warning",
            title: "Base de tickets vaciada",
            description: `${r.tickets_eliminados} tickets y ${r.seguimientos_eliminados} seguimientos eliminados.`,
          });
        },
        onError: errorToast("No se pudo vaciar la base"),
      },
    );
  };

  return (
    <TabsContent value="peligro" className="mt-4 max-w-3xl">
      <Card className="border-red-200">
        <CardHeader className="pb-3 bg-red-50/50 border-b border-red-100 rounded-t-xl">
          <CardTitle className="text-base flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Vaciar la base de datos
          </CardTitle>
          <CardDescription>
            Elimina <strong>todos</strong> los tickets y sus seguimientos, y
            reinicia los contadores de ID. La estructura de la base queda
            intacta. Esta acción <strong>no se puede deshacer</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <p className="text-sm text-slate-600">
            Actualmente hay <strong>{totalBaseQuery.data?.total ?? "…"}</strong>{" "}
            tickets en la base.
          </p>
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="confirm-borrar" className="text-sm">
              Para confirmar, escribí{" "}
              <span className="font-mono font-bold">BORRAR</span>:
            </Label>
            <Input
              id="confirm-borrar"
              value={confirmTexto}
              onChange={(e) => setConfirmTexto(e.target.value)}
              placeholder="BORRAR"
              autoComplete="off"
            />
          </div>
          <Button
            variant="destructive"
            disabled={confirmTexto !== "BORRAR" || truncate.isPending}
            onClick={ejecutarTruncate}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {truncate.isPending ? "Borrando..." : "Borrar todos los registros"}
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
