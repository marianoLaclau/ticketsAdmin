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
  { codigo: "prestamos_anticipos", label: "Préstamos y anticipos" },
  { codigo: "obra_social", label: "Obra social y aportes" },
  { codigo: "sanciones_ausencias", label: "Sanciones y ausencias" },
  { codigo: "proveedores_comercial", label: "Proveedores y comercial" },
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
  prestamos_anticipos: "Préstamos y anticipos",
  obra_social: "Obra social y aportes",
  sanciones_ausencias: "Sanciones y ausencias",
  proveedores_comercial: "Proveedores y comercial",
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
    // Va primero: no describe un tema sino QUIÉN llama. Si alguien se presenta
    // como proveedor u ofrece un servicio, no es una consulta de RRHH y no
    // debería mezclarse con las de los empleados.
    {
      categoria: "proveedores_comercial",
      patrones: [
        /\bproveedor\w*\b/,
        /\b(?:ofrec\w*|present\w*|enviar|acercar)(?:\s+\w+){0,4}\s+(?:cotizacion|presupuesto|propuesta comercial|nuestros servicios|un servicio|productos?)\b/,
        /\b(?:cotizacion|presupuesto)(?:\s+\w+){0,3}\s+(?:de\s+)?(?:seguro|art|medicina laboral|servicio)\b/,
        /\bpropuesta(?:\s+\w+){0,3}\s+(?:comercial|como proveedor)\b/,
        /\b(?:representante|asesor|ejecutiv[oa])(?:\s+\w+){0,2}\s+(?:comercial|de ventas|de cuentas)\b/,
        /\b(?:vender|venderles|comercializar)\b/,
      ],
    },
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
        // El ASR transcribe "liquidación final" como "licenciación final".
        /\blicenciacion\b/,
        /\b(?:baja laboral|desvinculacion|desvinculado|desvinculada|despido|renuncia)\b/,
        /\b(?:fin|finaliz\w*|termin\w*|venci\w*)(?:\s+\w+){0,4}\s+periodo de prueba\b/,
        /\bperiodo de prueba(?:\s+\w+){0,4}\s+(?:finaliz\w*|termin\w*|venci\w*)\b/,
        /\b(?:entreg\w*|devolv\w*)(?:\s+\w+){0,3}\s+uniforme\b/,
        // Despido expresado como verbo, no solo como sustantivo.
        /\bdespid\w*\b/,
        // "lo van a echar", "me echaron". Exige el pronombre para no capturar
        // "echar un vistazo" ni otros usos coloquiales del verbo.
        /\b(?:me|te|lo|la|los|las|nos)\s+(?:van a\s+|iban a\s+|pueden\s+)?(?:echar|echan|echen|echaron)\b/,
        /\bindemnizacion\b/,
        /\b(?:retiro voluntario|mutuo acuerdo|acuerdo de partes)\b/,
        // Negociación de salida: "llegar a un arreglo", "arreglo para irme".
        /\b(?:llegar|llegue|llega|lleguemos)(?:\s+\w+){0,2}\s+a\s+(?:un\s+)?(?:arreglo|acuerdo)\b/,
        /\b(?:arreglo|acuerdo|arregl\w*|acord\w*)(?:\s+\w+){0,6}\s+(?:dejar de trabajar|salida|irme|irse|retirarme|retirarse|desvincul\w*)\b/,
        /\b(?:dejar de trabajar|no trabajar mas|no seguir trabajando)\b/,
      ],
    },
    // Después de bajas: una llamada que mezcla faltas con negociación de salida
    // pertenece a la baja, que es la decisión de fondo. Una suspensión o un
    // apercibimiento sin salida en juego cae acá.
    {
      categoria: "sanciones_ausencias",
      patrones: [
        /\b(?:suspension|suspensiones|suspendid[oa]s?|suspender|suspenden|suspendieron)\b/,
        /\b(?:apercibimiento|sancion|sanciones|sancionad[oa]s?|amonestacion\w*|llamado de atencion)\b/,
        /\b(?:inasistencias?|ausentismo)\b/,
        // Solo el plural: "falta de pago" o "falta el recibo" no son ausencias.
        /\bfaltas\b(?!\s+de\s+(?:pago|dinero|plata|stock))/,
        /\bfalta\s+(?:injustificada|justificada)\b/,
        /\b(?:justificar|justificacion)(?:\s+\w+){0,3}\s+(?:falta|faltas|inasistencia|ausencia)\b/,
      ],
    },
    {
      categoria: "obra_social",
      patrones: [
        /\bobras? social(?:es)?\b/,
        /\b(?:osej|osde|swiss medical|galeno|omint|pami|sancor salud)\b/,
        /\baportes?(?:\s+\w+){0,3}\s+(?:obra social|jubilat\w*|previsional\w*|sindical\w*)\b/,
        /\b(?:credencial|carnet|cobertura|afiliacion)(?:\s+\w+){0,3}\s+(?:obra social|medic\w*)\b/,
      ],
    },
    {
      categoria: "prestamos_anticipos",
      patrones: [
        /\bprestamos?\b/,
        /\banticipos?\b/,
        /\badelanto(?:\s+\w+){0,2}\s+(?:sueldo|haberes|salario|quincena)\b/,
        /\bcuotas?(?:\s+\w+){0,3}\s+prestamo\b/,
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
        // "anticipo" se movió a prestamos_anticipos, que se evalúa antes.
        /\b(?:aguinaldo|diferencia salarial|deposito|acreditacion)\b/,
      ],
    },
    {
      categoria: "empleo_postulaciones",
      patrones: [
        /\bpostul\w*\b/,
        /\b(?:curriculum|cv|incorpor\w*|vacantes?)\b/,
        // Búsqueda de empleo: el verbo debe pegarse al sustantivo, opcionalmente
        // con un artículo indefinido. La regla anterior permitía hasta cuatro
        // palabras intermedias y aceptaba "consulta"/"pregunta", por lo que
        // "consulta por su situación de trabajo" —alguien que YA trabaja acá—
        // caía como postulación.
        /\b(?:busc\w*|solicit\w*|necesit\w*)(?:\s+(?:un|una|de))?\s+(?:empleo|trabajo|puesto)\b/,
        /\b(?:consult\w*|pregunt\w*|averigu\w*)(?:\s+\w+){0,3}\s+(?:vacantes?|puestos?|busquedas?|empleo)\b/,
        /\b(?:oportunidad(?:es)?|ofertas?)(?:\s+\w+){0,2}\s+(?:laboral\w*|de trabajo|de empleo)\b/,
        /\b(?:enviar|mandar|dejar|adjunt\w*)(?:\s+\w+){0,2}\s+(?:cv|curriculum)\b/,
      ],
    },
    {
      categoria: "contacto_general",
      patrones: [
        /\bllamada perdida\b/,
        /\bdevolv\w*(?:\s+\w+){0,3}\s+llamada\b/,
        /\bquien(?:\s+\w+){0,3}\s+llamo\b/,
        /\b(?:comunicar|comunicarse|contactar|contactarse)\b/,
        // Pedido de atención humana. Va en esta categoría por estar al final:
        // si el texto ya nombró un tema concreto, ganó la regla específica.
        /\bhablar con\b/,
        /\bno quiere hablar con un bot\b/,
        /\b(?:atienda|atienda me|atiendame)(?:\s+\w+){0,2}\s+(?:una persona|alguien|un humano)\b/,
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
  "sin motivo",
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
