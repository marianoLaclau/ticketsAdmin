import {
  MOTIVO_CATEGORIA_CODIGOS,
  MOTIVO_CATEGORIA_LABELS,
  type MotivoCategoria,
} from "@workspace/ingesta";

export type { MotivoCategoria };

/**
 * Presentación de cada categoría. El catálogo y sus etiquetas viven en
 * `@workspace/ingesta`, que es la fuente única compartida con el backend y con
 * el enum de la base; acá solo se agrega el color, que es puramente visual.
 *
 * Al estar tipado como Record de MotivoCategoria, agregar una categoría al
 * catálogo rompe la compilación hasta elegirle un color.
 */
const ESTILOS: Record<MotivoCategoria, { color: string; badgeClass: string }> =
  {
    haberes_pagos: {
      color: "#2563eb",
      badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
    },
    recibos_documentacion: {
      color: "#7c3aed",
      badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
    },
    vacaciones_licencias: {
      color: "#d97706",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    },
    bajas_liquidacion: {
      color: "#ea580c",
      badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
    },
    empleo_postulaciones: {
      color: "#059669",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    contacto_general: {
      color: "#0891b2",
      badgeClass: "border-cyan-200 bg-cyan-50 text-cyan-700",
    },
    reclamos: {
      color: "#dc2626",
      badgeClass: "border-red-200 bg-red-50 text-red-700",
    },
    embargos: {
      color: "#be123c",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
    },
    legales: {
      color: "#4f46e5",
      badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-700",
    },
    prestamos_anticipos: {
      color: "#0d9488",
      badgeClass: "border-teal-200 bg-teal-50 text-teal-700",
    },
    obra_social: {
      color: "#c026d3",
      badgeClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    },
    sanciones_ausencias: {
      color: "#b45309",
      badgeClass: "border-yellow-200 bg-yellow-50 text-yellow-800",
    },
    proveedores_comercial: {
      color: "#475569",
      badgeClass: "border-slate-300 bg-slate-100 text-slate-700",
    },
    sin_clasificar: {
      color: "#64748b",
      badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
    },
  };

export const MOTIVO_CATEGORIAS = Object.fromEntries(
  MOTIVO_CATEGORIA_CODIGOS.map((codigo) => [
    codigo,
    { label: MOTIVO_CATEGORIA_LABELS[codigo], ...ESTILOS[codigo] },
  ]),
) as Record<
  MotivoCategoria,
  { label: string; color: string; badgeClass: string }
>;

export const MOTIVO_CATEGORIA_OPTIONS = MOTIVO_CATEGORIA_CODIGOS.map(
  (codigo) => ({ value: codigo, ...MOTIVO_CATEGORIAS[codigo] }),
);

const FALLBACK_CATEGORIA = MOTIVO_CATEGORIAS.sin_clasificar;

export function getMotivoCategoriaConfig(categoria?: string | null) {
  if (!categoria) return FALLBACK_CATEGORIA;

  return (
    MOTIVO_CATEGORIAS[categoria as MotivoCategoria] ?? {
      ...FALLBACK_CATEGORIA,
      label: categoria
        .split("_")
        .filter(Boolean)
        .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
        .join(" "),
    }
  );
}
