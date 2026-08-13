import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Repeat2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RendimientoView {
  value: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  plannedInsights: readonly string[];
}

const VIEWS: readonly RendimientoView[] = [
  {
    value: "equipo",
    label: "Resumen equipo",
    title: "Resumen del equipo",
    description:
      "Una lectura ejecutiva del flujo de trabajo, los tiempos de atención y la evolución del backlog.",
    icon: BarChart3,
    plannedInsights: [
      "Ingresos, resoluciones y balance del período",
      "Tiempos de resolución y cumplimiento del plazo",
      "Backlog, antigüedad y casos en riesgo",
    ],
  },
  {
    value: "personas",
    label: "Personas",
    title: "Rendimiento individual",
    description:
      "Indicadores por persona con trazabilidad, volumen comparable y contexto sobre la complejidad atendida.",
    icon: UsersRound,
    plannedInsights: [
      "Resoluciones atribuibles y tamaño de muestra",
      "Tiempos de gestión y cumplimiento del plazo",
      "Carga actual, casos heredados y reaperturas",
    ],
  },
  {
    value: "reiteraciones",
    label: "Reiteraciones",
    title: "Contactos reiterados",
    description:
      "Seguimiento de personas con múltiples llamados y al menos una gestión todavía abierta.",
    icon: Repeat2,
    plannedInsights: [
      "Coincidencias confiables por DNI, teléfono o email",
      "Cantidad de llamados y antigüedad del caso abierto",
      "Última novedad, prioridad y responsable actual",
    ],
  },
  {
    value: "calidad",
    label: "Calidad de datos",
    title: "Calidad y cobertura",
    description:
      "Transparencia sobre qué información puede medirse y qué registros todavía no tienen atribución suficiente.",
    icon: DatabaseZap,
    plannedInsights: [
      "Cobertura de autoría y eventos de resolución",
      "Identificación disponible para reiteraciones",
      "Trazabilidad de plazos y registros sin atribuir",
    ],
  },
] as const;

function PreparationView({ view }: { view: RendimientoView }) {
  const Icon = view.icon;

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <h2 className="text-lg font-semibold leading-tight tracking-tight text-slate-950 sm:text-xl">
                {view.title}
              </h2>
              <CardDescription className="max-w-3xl leading-relaxed">
                {view.description}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="w-fit shrink-0 border-amber-200 bg-amber-50 text-amber-800"
          >
            En preparación
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.42fr)]">
          <section aria-labelledby={`${view.value}-planned-heading`}>
            <h3
              id={`${view.value}-planned-heading`}
              className="text-sm font-semibold text-slate-900"
            >
              Información prevista
            </h3>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {view.plannedInsights.map((insight) => (
                <li
                  key={insight}
                  className="flex min-w-0 items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </section>

          <aside className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Clock3 className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Próxima etapa
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Esta vista se habilitará con datos auditables. Hasta entonces no
              se presentan totales, rankings ni conclusiones parciales.
            </p>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Rendimiento() {
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
          Acceso dirección · En preparación
        </Badge>
      </header>

      <Tabs defaultValue="equipo" className="space-y-4">
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

        {VIEWS.map((view) => (
          <TabsContent key={view.value} value={view.value} className="mt-0">
            <PreparationView view={view} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
