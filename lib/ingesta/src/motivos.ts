/**
 * Catálogo estable y reglas deterministas para clasificar motivos de contacto.
 *
 * El texto recibido se conserva en `ticket.motivo`; estos códigos sirven para
 * agrupar y filtrar sin convertir cada redacción de n8n en una categoría nueva.
 */
export const MOTIVO_CATEGORIAS = [
  { codigo: "haberes_pagos", label: "Haberes y pagos" },
  { codigo: "recibos_documentacion", label: "Recibos y documentación" },
  { codigo: "vacaciones_licencias", label: "Vacaciones y licencias" },
  { codigo: "bajas_liquidacion", label: "Bajas y liquidación final" },
  { codigo: "empleo_postulaciones", label: "Empleo y postulaciones" },
  { codigo: "contacto_general", label: "Contacto y consultas generales" },
  { codigo: "reclamos", label: "Reclamos" },
  { codigo: "embargos", label: "Embargos" },
  { codigo: "legales", label: "Legales" },
  { codigo: "sin_clasificar", label: "Sin clasificar" },
] as const;

export type MotivoCategoria = (typeof MOTIVO_CATEGORIAS)[number]["codigo"];
export type MotivoCategoriaLabel = (typeof MOTIVO_CATEGORIAS)[number]["label"];

export const MOTIVO_CATEGORIA_CODIGOS = MOTIVO_CATEGORIAS.map(
  ({ codigo }) => codigo,
);

export const MOTIVO_CATEGORIA_LABELS: Record<
  MotivoCategoria,
  MotivoCategoriaLabel
> = {
  haberes_pagos: "Haberes y pagos",
  recibos_documentacion: "Recibos y documentación",
  vacaciones_licencias: "Vacaciones y licencias",
  bajas_liquidacion: "Bajas y liquidación final",
  empleo_postulaciones: "Empleo y postulaciones",
  contacto_general: "Contacto y consultas generales",
  reclamos: "Reclamos",
  embargos: "Embargos",
  legales: "Legales",
  sin_clasificar: "Sin clasificar",
};

interface ReglaClasificacionMotivo {
  categoria: Exclude<MotivoCategoria, "sin_clasificar">;
  patrones: readonly RegExp[];
}

/**
 * Las reglas están ordenadas desde las intenciones más específicas hasta las
 * más generales. La primera coincidencia gana, lo que resuelve de forma
 * reproducible textos como "reclamo por recibo de sueldo".
 */
export const REGLAS_CLASIFICACION_MOTIVO: readonly ReglaClasificacionMotivo[] =
  [
    {
      categoria: "embargos",
      patrones: [
        // El lookbehind evita confundir el conector discursivo "sin embargo"
        // con una retención judicial. Si el texto menciona luego un embargo
        // real, esa segunda aparición sí coincide.
        /(?<!\bsin\s)\b(?:des)?embarg\w*\b/,
        /\b(?:retencion|descuento)s?(?:\s+\w+){0,3}\s+(?:judicial|por\s+orden\s+judicial)\b/,
        /\borden judicial(?:\s+\w+){0,4}\s+(?:reten\w*|retuv\w*|retenc\w*|descont\w*|afect\w*)\b/,
        /\boficio(?:\s+\w+){0,3}\s+(?:retencion|descuento)(?:\s+de)?\s+(?:sueldo|salario|haberes)\b/,
      ],
    },
    {
      categoria: "legales",
      patrones: [
        /\b(?:carta documento|telegrama laboral|patrocinio letrado)\b/,
        /\b(?:estudio juridico|seclo)\b/,
        /\b(?:habl\w*|comunic\w*|contact\w*|consult\w*)(?:\s+\w+){0,2}\s+(?:con|a|al)\s+(?:un[oa]\s+)?abogad[oa]s?\b/,
        /\bderiv\w*(?:\s+\w+){0,2}\s+(?:a|al)\s+(?:un[oa]\s+)?abogad[oa]s?\b/,
        /\b(?:asesor\w*|represent\w*|patrocin\w*)(?:\s+\w+){0,2}\s+(?:de|por|con)\s+(?:un[oa]\s+)?abogad[oa]s?\b/,
        /\b(?:solicit\w*|busc\w*|requi\w*)(?:\s+\w+){0,1}\s+abogad[oa]s?\b/,
        /\babogad[oa]s?(?:\s+\w+){0,4}\s+(?:consulta|asesoramiento|representacion|patrocinio|demanda|juicio|audiencia|legal|laboral|judicial)\b/,
        /\b(?:asesoramiento|asesoria|consulta|orientacion)(?:\s+\w+){0,3}\s+(?:legal|juridic\w*)\b/,
        /\b(?:demanda|denuncia|juicio|litigio|accion)(?:\s+\w+){0,3}\s+(?:laboral|judicial|legal)\b/,
        /\b(?:audiencia|conciliacion|mediacion)(?:\s+\w+){0,3}\s+(?:laboral|judicial|seclo)\b/,
        /\b(?:area|departamento|sector)(?:\s+de)?\s+legales\b/,
        /\b(?:intimacion|intimar|intimado|intimada)\b/,
        /\bmedida cautelar(?:\s+\w+){0,2}\s+(?:judicial|laboral)\b/,
      ],
    },
    {
      categoria: "bajas_liquidacion",
      patrones: [
        /\bliquidacion\b/,
        /\b(?:baja laboral|desvinculacion|desvinculado|desvinculada|despido|renuncia)\b/,
        /\b(?:fin|finaliz\w*|termin\w*|venci\w*)(?:\s+\w+){0,4}\s+periodo de prueba\b/,
        /\bperiodo de prueba(?:\s+\w+){0,4}\s+(?:finaliz\w*|termin\w*|venci\w*)\b/,
        /\b(?:entreg\w*|devolv\w*)(?:\s+\w+){0,3}\s+uniforme\b/,
      ],
    },
    {
      categoria: "recibos_documentacion",
      patrones: [
        /\brecibos? (?:de )?(?:sueldo|haberes)\b/,
        /\bduplicado (?:del? )?recibo\b/,
        /\b(?:certificado|constancia) (?:laboral|de trabajo)\b/,
      ],
    },
    {
      categoria: "vacaciones_licencias",
      patrones: [/\bvacaciones?\b/, /\blicencias?\b/, /\bdias? de descanso\b/],
    },
    {
      categoria: "haberes_pagos",
      patrones: [
        /\bsueldos?\b/,
        /\bhaberes?\b/,
        /\bpago no recibido\b/,
        /\bno (?:me )?(?:pagaron|pagan|acreditaron|depositaron|cobro|cobre)\b/,
        /\b(?:aguinaldo|anticipo|diferencia salarial|deposito|acreditacion)\b/,
      ],
    },
    {
      categoria: "empleo_postulaciones",
      patrones: [
        /\bpostul\w*\b/,
        /\b(?:busc\w*|consult\w*|pregunt\w*)(?:\s+\w+){0,4}\s+(?:empleo|trabajo|vacante)\b/,
        /\b(?:curriculum|cv|incorpor\w*|vacantes?)\b/,
      ],
    },
    {
      categoria: "contacto_general",
      patrones: [
        /\bllamada perdida\b/,
        /\bdevolv\w*(?:\s+\w+){0,3}\s+llamada\b/,
        /\bquien(?:\s+\w+){0,3}\s+llamo\b/,
        /\b(?:comunicar|comunicarse|contactar|contactarse)\b/,
      ],
    },
    {
      categoria: "reclamos",
      patrones: [
        /\b(?:reclamo|reclamos|reclamar|queja|quejas|disconformidad)\b/,
      ],
    },
  ];

const TEXTOS_SIN_INFORMACION = new Set([
  "",
  "sin especificar",
  "sin informacion",
  "no informado",
  "no informada",
  "desconocido",
  "desconocida",
]);

/** Normalización compartida: minúsculas, sin tildes ni signos y un solo espacio. */
export function normalizarTextoMotivo(
  valor: string | null | undefined,
): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Clasifica primero el motivo. Solo consulta el resumen cuando el motivo no
 * coincide con ninguna regla, para no pisar una intención explícita. El texto
 * original nunca se modifica y lo desconocido cae en `sin_clasificar`.
 */
function clasificarTextoNormalizado(texto: string): MotivoCategoria | null {
  for (const regla of REGLAS_CLASIFICACION_MOTIVO) {
    if (regla.patrones.some((patron) => patron.test(texto)))
      return regla.categoria;
  }

  return null;
}

export function clasificarMotivo(
  motivo: string | null | undefined,
  resumen?: string | null,
): MotivoCategoria {
  const motivoNormalizado = normalizarTextoMotivo(motivo);
  if (!TEXTOS_SIN_INFORMACION.has(motivoNormalizado)) {
    const categoriaMotivo = clasificarTextoNormalizado(motivoNormalizado);
    if (categoriaMotivo) return categoriaMotivo;
  }

  const resumenNormalizado = normalizarTextoMotivo(resumen);
  if (!TEXTOS_SIN_INFORMACION.has(resumenNormalizado)) {
    const categoriaResumen = clasificarTextoNormalizado(resumenNormalizado);
    if (categoriaResumen) return categoriaResumen;
  }

  return "sin_clasificar";
}
