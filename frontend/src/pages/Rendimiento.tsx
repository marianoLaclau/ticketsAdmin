import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  DatabaseZap,
  Repeat2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RendimientoFiltersPanel } from "@/features/rendimiento/RendimientoFiltersPanel";
import { RendimientoChatWidget } from "@/features/rendimiento/RendimientoChatWidget";
import { RendimientoPersonasView } from "@/features/rendimiento/RendimientoPersonasView";
import { RendimientoQualityView } from "@/features/rendimiento/RendimientoQualityView";
import { RendimientoReiteracionesView } from "@/features/rendimiento/RendimientoReiteracionesView";
import { ResumenEquipoView } from "@/features/rendimiento/ResumenEquipoView";
import { useRendimientoFiltersUrl } from "@/features/rendimiento/useRendimientoFiltersUrl";
import {
  createDefaultRendimientoUrlState,
  type RendimientoFilterState,
  type RendimientoVista,
} from "@/lib/rendimiento-url";

interface RendimientoView {
  value: RendimientoVista;
  label: string;
  icon: LucideIcon;
}

const VIEWS: readonly RendimientoView[] = [
  {
    value: "equipo",
    label: "Resumen equipo",
    icon: BarChart3,
  },
  {
    value: "personas",
    label: "Operadores",
    icon: UsersRound,
  },
  {
    value: "reiteraciones",
    label: "Contactos recurrentes",
    icon: Repeat2,
  },
  {
    value: "calidad",
    label: "Calidad de datos",
    icon: DatabaseZap,
  },
] as const;

export default function Rendimiento() {
  const { urlState, updateUrlState } = useRendimientoFiltersUrl();

  const applyFilters = (nextState: RendimientoFilterState) => {
    updateUrlState((current) => ({ ...nextState, vista: current.vista }));
  };

  const resetFilters = () => {
    updateUrlState((current) => ({
      ...createDefaultRendimientoUrlState(),
      vista: current.vista,
    }));
  };

  const selectView = (nextView: string) => {
    const view = VIEWS.find(({ value }) => value === nextView);
    if (!view) return;
    updateUrlState((current) => ({ ...current, vista: view.value }), "push");
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col space-y-4 p-4 md:p-8">
      <header className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Rendimiento
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Una vista ejecutiva para comprender la capacidad del equipo, la
            calidad de atención y las situaciones que necesitan seguimiento.
          </p>
        </div>

        <Badge
          variant="outline"
          className="w-fit shrink-0 border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm"
        >
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Acceso dirección
        </Badge>
      </header>

      <Tabs
        value={urlState.vista}
        onValueChange={selectView}
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 lg:grid-cols-4">
          {VIEWS.map((view) => {
            const Icon = view.icon;
            return (
              <TabsTrigger
                key={view.value}
                value={view.value}
                className="min-h-10 min-w-0 gap-2 whitespace-normal px-2 py-2 text-center leading-tight sm:px-3"
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{view.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <RendimientoFiltersPanel
          state={urlState}
          onApply={applyFilters}
          onReset={resetFilters}
        />

        {VIEWS.map((view) => (
          <TabsContent key={view.value} value={view.value} className="mt-0">
            {view.value === "equipo" ? (
              <ResumenEquipoView
                filters={urlState}
                onClearFilters={resetFilters}
              />
            ) : view.value === "personas" ? (
              <RendimientoPersonasView
                filters={urlState}
                onClearFilters={resetFilters}
              />
            ) : view.value === "reiteraciones" ? (
              <RendimientoReiteracionesView
                filters={urlState}
                onClearFilters={resetFilters}
              />
            ) : (
              <RendimientoQualityView
                filters={urlState}
                onClearFilters={resetFilters}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <RendimientoChatWidget />
    </div>
  );
}
