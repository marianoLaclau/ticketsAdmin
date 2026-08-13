import type { Seguimiento } from "@workspace/api-client-react";
import { History, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getAssignedDisplayName } from "@/lib/asignacion";
import { getFunctionalFieldLabel } from "@/lib/ticket-edit";
import { EstadoBadge, formatDate, PrioridadBadge } from "@/lib/utils-tickets";

interface TicketHistoryCardProps {
  seguimientos: readonly Seguimiento[] | undefined;
  isLoading: boolean;
  canAddSeguimiento: boolean;
  draft: string;
  isSubmitting: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}

export function TicketHistoryCard({
  seguimientos,
  isLoading,
  canAddSeguimiento,
  draft,
  isSubmitting,
  onDraftChange,
  onSubmit,
}: TicketHistoryCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5 text-primary" aria-hidden="true" />
          Historial y Seguimiento
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {canAddSeguimiento && (
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <div className="flex gap-3">
              <Textarea
                placeholder="Agregar una nota de seguimiento o actualización..."
                aria-label="Nueva nota de seguimiento"
                className="min-h-[80px] bg-white resize-y"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
              />
            </div>
            <div className="flex justify-end mt-3">
              <Button
                size="sm"
                onClick={onSubmit}
                disabled={!draft.trim() || isSubmitting}
              >
                {isSubmitting ? "Guardando..." : "Agregar Nota"}
              </Button>
            </div>
          </div>
        )}

        {/* Timeline list */}
        <div className="p-4 sm:p-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !seguimientos || seguimientos.length === 0 ? (
            <div className="text-center text-slate-500 py-8 text-sm">
              No hay seguimientos registrados para este ticket.
            </div>
          ) : (
            <div className="space-y-6">
              {seguimientos.map((seg: Seguimiento, idx: number) => (
                <div key={seg.id} className="relative pl-6">
                  {idx !== seguimientos.length - 1 && (
                    <div className="absolute left-[11px] top-6 bottom-[-24px] w-[2px] bg-slate-100" />
                  )}
                  <div className="absolute left-0 top-1 h-6 w-6 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center">
                    <MessageSquare
                      className="h-3 w-3 text-slate-500"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="bg-white border border-slate-100 rounded-lg p-4 shadow-sm">
                    <div className="mb-2 flex flex-col items-start justify-between gap-1 sm:flex-row">
                      <span className="font-medium text-sm text-slate-900">
                        {seg.autor || "Sistema"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatDate(seg.fecha_creacion)}
                      </span>
                    </div>

                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {seg.nota}
                    </p>

                    {(seg.estado_anterior || seg.estado_nuevo) &&
                      seg.estado_anterior !== seg.estado_nuevo && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
                          <span className="text-slate-500">
                            Cambio de estado:
                          </span>
                          {seg.estado_anterior && (
                            <EstadoBadge
                              estado={seg.estado_anterior}
                              className="text-[10px] py-0 px-1.5"
                            />
                          )}
                          <span className="text-slate-400">→</span>
                          {seg.estado_nuevo && (
                            <EstadoBadge
                              estado={seg.estado_nuevo}
                              className="text-[10px] py-0 px-1.5"
                            />
                          )}
                        </div>
                      )}

                    {(seg.prioridad_anterior || seg.prioridad_nueva) &&
                      seg.prioridad_anterior !== seg.prioridad_nueva && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
                          <span className="text-slate-500">
                            Cambio de prioridad:
                          </span>
                          {seg.prioridad_anterior && (
                            <PrioridadBadge
                              prioridad={seg.prioridad_anterior}
                              className="text-[10px] py-0 px-1.5"
                            />
                          )}
                          <span className="text-slate-400">→</span>
                          {seg.prioridad_nueva && (
                            <PrioridadBadge
                              prioridad={seg.prioridad_nueva}
                              className="text-[10px] py-0 px-1.5"
                            />
                          )}
                        </div>
                      )}

                    {(seg.asignado_anterior_usuario_id !==
                      seg.asignado_nuevo_usuario_id ||
                      seg.asignado_anterior !== seg.asignado_nuevo) &&
                      (seg.asignado_anterior ||
                        seg.asignado_nuevo ||
                        seg.asignado_anterior_usuario_id ||
                        seg.asignado_nuevo_usuario_id) && (
                        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                          <span className="font-medium">
                            Cambio de asignación:
                          </span>{" "}
                          {getAssignedDisplayName(seg.asignado_anterior)}
                          <span className="px-1.5 text-slate-400">→</span>
                          {getAssignedDisplayName(seg.asignado_nuevo)}
                        </div>
                      )}

                    {seg.campos_editados && seg.campos_editados.length > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                        <span className="font-medium">Datos editados:</span>{" "}
                        {seg.campos_editados
                          .map(getFunctionalFieldLabel)
                          .join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
