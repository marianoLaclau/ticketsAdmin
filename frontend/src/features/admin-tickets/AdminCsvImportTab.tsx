import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useImportCsv,
  type AdminImportResult,
} from "@workspace/api-client-react";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { AdminAccessNotice } from "@/components/admin/AdminAccessNotice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { useToast } from "@/hooks/use-toast";
import type { AdminAccessState } from "@/lib/admin-access-state";
import { getAdminErrorMessage } from "@/lib/error-messages";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";

interface AdminCsvImportTabProps {
  request: RequestInit;
  adminAccessState: AdminAccessState;
  accessVersion: number;
  accessGeneration: number;
}

export function AdminCsvImportTab({
  request,
  adminAccessState,
  accessVersion,
  accessGeneration,
}: AdminCsvImportTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const importCsv = useImportCsv({ request });
  const { reset: resetImportCsv } = importCsv;
  const accessBoundary = `${adminAccessState}:${accessVersion}:${accessGeneration}`;
  const { isCurrentOperation, operationGeneration } = useAdminOperationGuard(
    adminAccessState,
    accessGeneration,
  );
  const fileReadAttemptRef = useRef(0);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [csvNombre, setCsvNombre] = useState("");
  const [csvTexto, setCsvTexto] = useState("");
  const [resultadoImport, setResultadoImport] =
    useState<AdminImportResult | null>(null);
  const resetAccessBoundaryRef = useRef(accessBoundary);

  useLayoutEffect(() => {
    if (resetAccessBoundaryRef.current === accessBoundary) return;
    resetAccessBoundaryRef.current = accessBoundary;
    fileReadAttemptRef.current += 1;
    setIsReadingFile(false);
    setCsvNombre("");
    setCsvTexto("");
    setResultadoImport(null);
    resetImportCsv();
  }, [accessBoundary, resetImportCsv]);

  const refrescarTickets = () => invalidateTicketDomainQueries(queryClient);

  const errorToast =
    (title: string, operationAccessGeneration: number) => (err: unknown) => {
      if (!isCurrentOperation(operationAccessGeneration)) return;
      toast({
        variant: "destructive",
        title,
        description: getAdminErrorMessage(err),
      });
    };

  const onArchivoSeleccionado = async (e: ChangeEvent<HTMLInputElement>) => {
    if (
      !isCurrentOperation(operationGeneration) ||
      isReadingFile ||
      importCsv.isPending
    ) {
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const operationAccessGeneration = operationGeneration;
    const fileReadAttempt = fileReadAttemptRef.current + 1;
    fileReadAttemptRef.current = fileReadAttempt;
    setIsReadingFile(true);
    setCsvNombre(file.name);
    setCsvTexto("");
    setResultadoImport(null);
    resetImportCsv();

    let texto: string;
    try {
      texto = await file.text();
    } catch {
      if (
        fileReadAttemptRef.current !== fileReadAttempt ||
        !isCurrentOperation(operationAccessGeneration)
      )
        return;
      setIsReadingFile(false);
      setCsvNombre("");
      toast({
        variant: "destructive",
        title: "No se pudo leer el archivo",
        description:
          "Verificá que el CSV siga disponible y volvé a seleccionarlo.",
      });
      return;
    }
    if (
      fileReadAttemptRef.current !== fileReadAttempt ||
      !isCurrentOperation(operationAccessGeneration)
    )
      return;
    setCsvTexto(texto);
    setIsReadingFile(false);
    // Simulación automática al elegir el archivo
    importCsv.mutate(
      { data: { csv: texto, dry_run: true } },
      {
        onSuccess: (result) => {
          if (
            fileReadAttemptRef.current !== fileReadAttempt ||
            !isCurrentOperation(operationAccessGeneration)
          )
            return;
          setResultadoImport(result);
        },
        onError: (error) => {
          if (
            fileReadAttemptRef.current !== fileReadAttempt ||
            !isCurrentOperation(operationAccessGeneration)
          )
            return;
          errorToast(
            "No se pudo analizar el archivo",
            operationAccessGeneration,
          )(error);
        },
      },
    );
  };

  const importarDefinitivo = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      isReadingFile ||
      importCsv.isPending ||
      !resultadoImport?.dry_run ||
      !csvTexto
    )
      return;
    const operationAccessGeneration = operationGeneration;
    importCsv.mutate(
      { data: { csv: csvTexto, dry_run: false } },
      {
        onSuccess: (r) => {
          if (!isCurrentOperation(operationAccessGeneration)) return;
          setResultadoImport(r);
          void refrescarTickets();
          toast({
            dedupeKey: `tickets-imported:${r.insertados}`,
            variant: "success",
            title: "Importación completada",
            description: `${r.insertados} nuevos · ${r.ya_existentes} ya existentes · ${r.invalidos} inválidos`,
          });
        },
        onError: errorToast(
          "No se pudo importar el archivo",
          operationAccessGeneration,
        ),
      },
    );
  };

  if (adminAccessState !== "ready") {
    return (
      <TabsContent value="importar" className="mt-4 max-w-3xl">
        <AdminAccessNotice
          state={adminAccessState}
          pendingDescription="Esperá un instante antes de analizar o importar archivos."
          missingDescription="La importación permanece protegida. Completá la llave en la cabecera para continuar."
        />
      </TabsContent>
    );
  }

  return (
    <TabsContent value="importar" className="mt-4 space-y-4 max-w-3xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
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
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void onArchivoSeleccionado(event)}
              disabled={isReadingFile || importCsv.isPending}
              className="max-w-sm cursor-pointer"
              aria-label="Seleccionar archivo CSV para importar"
            />
            {csvNombre && (
              <span className="text-sm text-muted-foreground">{csvNombre}</span>
            )}
          </div>

          {(isReadingFile || importCsv.isPending) && (
            <>
              <LoadingStatus>
                {isReadingFile
                  ? "Leyendo archivo CSV"
                  : resultadoImport?.dry_run
                    ? "Importando archivo CSV"
                    : "Analizando archivo CSV"}
              </LoadingStatus>
              <Skeleton className="h-24 w-full" />
            </>
          )}

          {resultadoImport && (
            <div
              className={`rounded-lg border p-4 space-y-3 ${resultadoImport.dry_run ? "bg-blue-50/50 border-blue-200" : "bg-emerald-50/50 border-emerald-200"}`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  {resultadoImport.dry_run ? (
                    <>Simulación — así quedaría la importación</>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />{" "}
                      Importación aplicada
                    </>
                  )}
                </h4>
                <span className="text-xs text-muted-foreground">
                  {resultadoImport.filas} filas leídas
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
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
                  <Upload className="mr-2 h-4 w-4" />
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
