import type { Ticket } from "@workspace/api-client-react";
import { FileText, Headphones, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TicketCallSummaryCardProps {
  summary: Ticket["resumen"];
  audioUrl: Ticket["audio_url"];
  notes: Ticket["notas"];
}

export function TicketCallSummaryCard({
  summary,
  audioUrl,
  notes,
}: TicketCallSummaryCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-100">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Resumen del Llamado
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-6">
        <div>
          <h4 className="text-sm font-medium text-slate-500 mb-1">
            Descripción
          </h4>
          <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
            {summary || "Sin descripción detallada."}
          </p>
        </div>

        {/* Audio Player */}
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
          <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
            <Headphones className="h-4 w-4 text-slate-500" />
            Grabación de la Llamada
          </h4>
          {audioUrl ? (
            <audio controls className="w-full h-10" src={audioUrl}>
              Tu navegador no soporta el elemento de audio.
            </audio>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-white border border-slate-200 border-dashed rounded p-3">
              <PlayCircle className="h-4 w-4 opacity-50" />
              Sin grabación disponible para este caso.
            </div>
          )}
        </div>

        {notes && (
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
            <h4 className="text-sm font-medium text-amber-800 mb-1">
              Notas Internas
            </h4>
            <p className="text-amber-900/80 text-sm whitespace-pre-wrap">
              {notes}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
