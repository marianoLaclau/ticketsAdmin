import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useImportCsv,
  type AdminImportResult,
} from "@workspace/api-client-react";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { useToast } from "@/hooks/use-toast";
import { getAdminErrorMessage } from "@/lib/error-messages";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";

function getImportAnnouncement(result: AdminImportResult): string {
  const stage = result.dry_run
    ? "Simulación completada"
    : "Importación completada";
  const rowsLabel = result.filas === 1 ? "fila leída" : "filas leídas";
  const existingLabel =
    result.ya_existentes === 1 ? "ya existente" : "ya existentes";
  const invalidLabel = result.invalidos === 1 ? "inválida" : "inválidas";

  return `${stage}. ${result.filas} ${rowsLabel}: ${result.insertados} ${result.dry_run ? "a insertar" : "insertadas"}, ${result.ya_existentes} ${existingLabel} y ${result.invalidos} ${invalidLabel}.`;
}

export function AdminCsvImportTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const importCsv = useImportCsv();
  const { reset: resetImportCsv } = importCsv;
  const isCurrentOperation = useAdminOperationGuard();
  const fileReadAttemptRef = useRef(0);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [csvNombre, setCsvNombre] = useState("");
  const [csvTexto, setCsvTexto] = useState("");
  const [csvAnnouncement, setCsvAnnouncement] = useState("");
  const [resultadoImport, setResultadoImport] =
    useState<AdminImportResult | null>(null);

  const refrescarTickets = () => invalidateTicketDomainQueries(queryClient);

  const errorToast = (title: string) => (err: unknown) => {
    if (!isCurrentOperation()) return;
    const description = getAdminErrorMessage(err);
    // El toast de error ya aporta el live region assertive. Se limpia el
    // estado polite para evitar que el lector anuncie el mismo error dos veces.
    setCsvAnnouncement("");
    toast({
      variant: "destructive",
      title,
      description,
    });
  };

  const onArchivoSeleccionado = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!isCurrentOperation() || isReadingFile || importCsv.isPending) {
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const fileReadAttempt = fileReadAttemptRef.current + 1;
    fileReadAttemptRef.current = fileReadAttempt;
    setIsReadingFile(true);
    setCsvNombre(file.name);
    setCsvTexto("");
    setCsvAnnouncement("Leyendo archivo CSV.");
    setResultadoImport(null);
    resetImportCsv();

    let texto: string;
    try {
      texto = await file.text();
    } catch {
      if (
        fileReadAttemptRef.current !== fileReadAttempt ||
        !isCurrentOperation()
      )
        return;
      setIsReadingFile(false);
      setCsvNombre("");
      setCsvAnnouncement("");
      toast({
        variant: "destructive",
        title: "No se pudo leer el archivo",
        description:
          "Verificá que el CSV siga disponible y volvé a seleccionarlo.",
      });
      return;
    }
    if (fileReadAttemptRef.current !== fileReadAttempt || !isCurrentOperation())
      return;
    setCsvTexto(texto);
    setIsReadingFile(false);
    setCsvAnnouncement("Analizando archivo CSV.");
    // Simulación automática al elegir el archivo
    importCsv.mutate(
      { data: { csv: texto, dry_run: true } },
      {
        onSuccess: (result) => {
          if (
            fileReadAttemptRef.current !== fileReadAttempt ||
            !isCurrentOperation()
          )
            return;
          setResultadoImport(result);
          setCsvAnnouncement(getImportAnnouncement(result));
        },
        onError: (error) => {
          if (
            fileReadAttemptRef.current !== fileReadAttempt ||
            !isCurrentOperation()
          )
            return;
          errorToast("No se pudo analizar el archivo")(error);
        },
      },
    );
  };

  const importarDefinitivo = () => {
    if (
      !isCurrentOperation() ||
      isReadingFile ||
      importCsv.isPending ||
      !resultadoImport?.dry_run ||
      !csvTexto
    )
      return;
    setCsvAnnouncement("Importando archivo CSV.");
    importCsv.mutate(
      { data: { csv: csvTexto, dry_run: false } },
      {
        onSuccess: (r) => {
          if (!isCurrentOperation()) return;
          setResultadoImport(r);
          setCsvAnnouncement(getImportAnnouncement(r));
          void refrescarTickets();
          toast({
            dedupeKey: `tickets-imported:${r.insertados}`,
            variant: "success",
            title: "Importación completada",
            description: `${r.insertados} nuevos · ${r.ya_existentes} ya existentes · ${r.invalidos} inválidos`,
          });
        },
        onError: errorToast("No se pudo importar el archivo"),
      },
    );
  };

  return (
    <TabsContent value="importar" className="mt-4 space-y-4 max-w-3xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            Importar registros desde CSV
          </CardTitle>
          <CardDescription>
            Mismo formato que el export de n8n (separado por «;» o «,»). Se
            detectan las columnas automáticamente y las filas cuyo
            conversation_id ya existe se saltean — se puede importar el mismo
            archivo varias veces sin duplicar. Al elegir el archivo se muestra
            una
            <strong> simulación</strong>; nada se escribe hasta confirmar.
          </CardDescription>
        </CardHeader>
        <CardContent
          className="space-y-4"
          aria-busy={isReadingFile || importCsv.isPending}
        >
          <p
            id="csv-import-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {csvAnnouncement}
          </p>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void onArchivoSeleccionado(event)}
              disabled={isReadingFile || importCsv.isPending}
              className="w-full max-w-sm cursor-pointer"
              aria-label="Seleccionar archivo CSV para importar"
            />
            {csvNombre && (
              <span className="max-w-full break-all text-sm text-muted-foreground">
                {csvNombre}
              </span>
            )}
          </div>

          {(isReadingFile || importCsv.isPending) && (
            <Skeleton className="h-24 w-full" aria-hidden="true" />
          )}

          {resultadoImport && (
            <div
              className={`rounded-lg border p-4 space-y-3 ${resultadoImport.dry_run ? "bg-blue-50/50 border-blue-200" : "bg-emerald-50/50 border-emerald-200"}`}
            >
              <div className="flex flex-col items-start justify-between gap-1 sm:flex-row sm:items-center">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  {resultadoImport.dry_run ? (
                    <>Simulación — así quedaría la importación</>
                  ) : (
                    <>
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600"
                        aria-hidden="true"
                      />{" "}
                      Importación aplicada
                    </>
                  )}
                </h4>
                <span className="text-xs text-muted-foreground">
                  {resultadoImport.filas} filas leídas
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3 sm:gap-3">
                <div className="bg-white rounded-md border p-2">
                  <p className="text-2xl font-bold text-emerald-700">
                    {resultadoImport.insertados}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {resultadoImport.dry_run ? "a insertar" : "insertados"}
                  </p>
                </div>
                <div className="bg-white rounded-md border p-2">
                  <p className="text-2xl font-bold text-slate-500">
                    {resultadoImport.ya_existentes}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    ya existentes
                  </p>
                </div>
                <div className="bg-white rounded-md border p-2">
                  <p className="text-2xl font-bold text-amber-600">
                    {resultadoImport.invalidos}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    inválidos
                  </p>
                </div>
              </div>

              <div className="text-xs space-y-1">
                <p className="font-medium text-slate-700">
                  Columnas detectadas:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {resultadoImport.columnas.map((c) => (
                    <span
                      key={c.campo}
                      className="bg-white border rounded px-1.5 py-0.5 font-mono text-[11px]"
                    >
                      {c.columna} →{" "}
                      <span className="text-primary font-semibold">
                        {c.campo}
                      </span>
                    </span>
                  ))}
                </div>
                {resultadoImport.sin_mapear.length > 0 && (
                  <p className="text-amber-700 mt-1">
                    Ignoradas: {resultadoImport.sin_mapear.join(", ")}
                  </p>
                )}
                {resultadoImport.advertencias.map((a, i) => (
                  <p key={i} className="text-amber-700">
                    ⚠ {a}
                  </p>
                ))}
              </div>

              {resultadoImport.dry_run && (
                <Button
                  onClick={importarDefinitivo}
                  disabled={
                    resultadoImport.insertados === 0 ||
                    isReadingFile ||
                    importCsv.isPending
                  }
                  className="w-full"
                >
                  <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                  {resultadoImport.insertados === 0
                    ? "Nada nuevo para importar"
                    : `Importar ${resultadoImport.insertados} registros`}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
