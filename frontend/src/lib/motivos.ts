export const MOTIVO_CATEGORIAS = {
  haberes_pagos: {
    label: 'Haberes y pagos',
    color: '#2563eb',
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  recibos_documentacion: {
    label: 'Recibos y documentación',
    color: '#7c3aed',
    badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  vacaciones_licencias: {
    label: 'Vacaciones y licencias',
    color: '#d97706',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  bajas_liquidacion: {
    label: 'Bajas y liquidación final',
    color: '#ea580c',
    badgeClass: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  empleo_postulaciones: {
    label: 'Empleo y postulaciones',
    color: '#059669',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  contacto_general: {
    label: 'Contacto y consultas generales',
    color: '#0891b2',
    badgeClass: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  },
  reclamos: {
    label: 'Reclamos',
    color: '#dc2626',
    badgeClass: 'border-red-200 bg-red-50 text-red-700',
  },
  embargos: {
    label: 'Embargos',
    color: '#be123c',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  legales: {
    label: 'Legales',
    color: '#4f46e5',
    badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  sin_clasificar: {
    label: 'Sin clasificar',
    color: '#64748b',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
  },
} as const;

export type MotivoCategoria = keyof typeof MOTIVO_CATEGORIAS;

export const MOTIVO_CATEGORIA_OPTIONS = Object.entries(MOTIVO_CATEGORIAS).map(
  ([value, config]) => ({
    value: value as MotivoCategoria,
    ...config,
  }),
);

const FALLBACK_CATEGORIA = MOTIVO_CATEGORIAS.sin_clasificar;

export function getMotivoCategoriaConfig(categoria?: string | null) {
  if (!categoria) return FALLBACK_CATEGORIA;

  return (
    MOTIVO_CATEGORIAS[categoria as MotivoCategoria] ?? {
      ...FALLBACK_CATEGORIA,
      label: categoria
        .split('_')
        .filter(Boolean)
        .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
        .join(' '),
    }
  );
}
