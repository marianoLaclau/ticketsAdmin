import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { rendimientoNumberFormatter } from "./rendimiento-format";
import {
  formatPercentage,
  normalizeCount,
  normalizePercentage,
} from "./resumen-equipo-format";

interface KpiCardProps {
  title: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: "slate" | "blue" | "emerald" | "red";
}

const KPI_TONES: Record<KpiCardProps["tone"], string> = {
  slate: "border-slate-200 bg-card text-slate-700 [&_.kpi-icon]:bg-slate-100",
  blue: "border-blue-200 bg-blue-50 text-blue-800 [&_.kpi-icon]:bg-blue-100",
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-800 [&_.kpi-icon]:bg-emerald-100",
  red: "border-red-200 bg-red-50 text-red-800 [&_.kpi-icon]:bg-red-100",
};

export function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: KpiCardProps) {
  return (
    <article
      className={cn(
        "flex min-w-0 items-center gap-4 rounded-xl border px-4 py-4 shadow-sm sm:px-5",
        KPI_TONES[tone],
      )}
    >
      <div className="kpi-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider">
          {title}
        </h3>
        <p className="mt-1 text-3xl font-bold leading-none tabular-nums">
          {rendimientoNumberFormatter.format(normalizeCount(value))}
        </p>
        <p className="mt-1 text-[11px] opacity-80">{detail}</p>
      </div>
    </article>
  );
}

interface OperationalKpiCardProps {
  id: string;
  title: string;
  value: string;
  detail: string;
  description: string;
  note?: string | undefined;
  icon: LucideIcon;
  tone: "blue" | "amber" | "violet" | "emerald";
  percentage?: number | null;
  progressValueText?: string | undefined;
  scopeLabel?: string | undefined;
}

const OPERATIONAL_KPI_TONES: Record<OperationalKpiCardProps["tone"], string> = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
  emerald: "bg-emerald-50 text-emerald-700",
};

export function OperationalKpiCard({
  id,
  title,
  value,
  detail,
  description,
  note,
  icon: Icon,
  tone,
  percentage,
  progressValueText,
  scopeLabel,
}: OperationalKpiCardProps) {
  const descriptionId = `${id}-description`;
  const normalizedProgress = normalizePercentage(percentage ?? null);

  return (
    <article
      className="flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      aria-describedby={descriptionId}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            OPERATIONAL_KPI_TONES[tone],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id={id} className="text-sm font-semibold leading-tight">
            {title}
          </h3>
          {scopeLabel ? (
            <Badge
              variant="outline"
              className="mt-1 h-auto max-w-full whitespace-normal bg-slate-50 px-2 py-0.5 text-left text-[10px] font-medium leading-tight text-muted-foreground"
            >
              Período evaluado: {scopeLabel}
            </Badge>
          ) : null}
          <p className="mt-2 text-2xl font-bold leading-none tabular-nums sm:text-3xl">
            {value}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs font-medium leading-relaxed text-foreground">
        {detail}
      </p>
      <p
        id={descriptionId}
        className="mt-1 text-xs leading-relaxed text-muted-foreground"
      >
        {description}
      </p>
      {note ? (
        <p className="mt-2 text-xs font-medium leading-relaxed text-amber-800">
          {note}
        </p>
      ) : null}

      {normalizedProgress !== null ? (
        <div className="mt-auto pt-4">
          <Progress
            value={normalizedProgress}
            aria-label={title}
            aria-valuetext={
              progressValueText ?? formatPercentage(percentage ?? null)
            }
          />
        </div>
      ) : null}
    </article>
  );
}
