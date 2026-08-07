import { useState, type ChangeEvent } from "react";
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
import { adminErrorMessage } from "@/hooks/use-admin-access";
import { useToast } from "@/hooks/use-toast";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";

interface AdminCsvImportTabProps {
  request: RequestInit;
}

export function AdminCsvImportTab({ request }: AdminCsvImportTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const importCsv = useImportCsv({ request });
  const [csvNombre, setCsvNombre] = useState("");
  const [csvTexto, setCsvTexto] = useState("");
  const [resultadoImport, setResultadoImport] =
    useState<AdminImportResult | null>(null);

  const refrescarTickets = () => invalidateTicketDomainQueries(queryClient);

  const errorToast = (title: string) => (err: unknown) => {
    toast({
      variant: "destructive",
      title,
      description: adminErrorMessage(err),
    });
  };

  const onArchivoSeleccionado = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const texto = await file.text();
    setCsvNombre(file.name);
    setCsvTexto(texto);
    setResultadoImport(null);
    // Simulación automática al elegir el archivo
    importCsv.mutate(
      { data: { csv: texto, dry_run: true } },
      {
        onSuccess: setResultadoImport,
        onError: errorToast("No se pudo analizar el archivo"),
      },
    );
    e.target.value = "";
  };

  const importarDefinitivo = () => {
    importCsv.mutate(
      { data: { csv: csvTexto, dry_run: false } },
      {
        onSuccess: (r) => {
          setResultadoImport(r);
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
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void onArchivoSeleccionado(event)}
              className="max-w-sm cursor-pointer"
            />
            {csvNombre && (
              <span className="text-sm text-muted-foreground">{csvNombre}</span>
            )}
          </div>

          {importCsv.isPending && <Skeleton className="h-24 w-full" />}

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
                    resultadoImport.insertados === 0 || importCsv.isPending
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
