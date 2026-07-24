import { TZDateMini } from "@date-fns/tz";

const HORA_MS = 60 * 60 * 1000;

export const SLA_HORAS_HABILES = 48;
export const SLA_TIME_ZONE = "America/Argentina/Buenos_Aires";
export const PRIORIDAD_ALTA_UMBRAL_HORAS = 24;
export const PRIORIDAD_URGENTE_UMBRAL_HORAS = 12;

export const PRIORIDADES_SLA = ["baja", "media", "alta", "urgente"] as const;
export type PrioridadSla = (typeof PRIORIDADES_SLA)[number];

const RANGO_PRIORIDAD: Record<PrioridadSla, number> = {
  baja: 0,
  media: 1,
  alta: 2,
  urgente: 3,
};

function validarFecha(fecha: Date, nombre: string): void {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
    throw new RangeError(`${nombre} no es una fecha valida`);
  }
}

function milisegundosHabilesEnOrden(desde: Date, hasta: Date): number {
  const cursor = new TZDateMini(desde.getTime(), SLA_TIME_ZONE);
  const finMs = hasta.getTime();
  let totalMs = 0;

  while (cursor.getTime() < finMs) {
    const dia = cursor.getDay();

    if (dia === 6 || dia === 0) {
      cursor.setDate(cursor.getDate() + (dia === 6 ? 2 : 1));
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    const proximaMedianoche = new TZDateMini(cursor.getTime(), SLA_TIME_ZONE);
    proximaMedianoche.setDate(proximaMedianoche.getDate() + 1);
    proximaMedianoche.setHours(0, 0, 0, 0);

    const finTramoMs = Math.min(proximaMedianoche.getTime(), finMs);
    totalMs += finTramoMs - cursor.getTime();
    cursor.setTime(finTramoMs);
  }

  return totalMs;
}

/**
 * Calcula horas habiles entre dos instantes en la zona de negocio.
 *
 * El resultado es positivo cuando `hasta` es posterior a `desde`, negativo
 * cuando ya paso y cero si el intervalo transcurre enteramente en fin de
 * semana. Se conservan las fracciones de hora y no se contemplan feriados.
 */
export function calcularHorasHabilesEntre(desde: Date, hasta: Date): number {
  validarFecha(desde, "La fecha inicial");
  validarFecha(hasta, "La fecha final");

  const desdeMs = desde.getTime();
  const hastaMs = hasta.getTime();
  if (desdeMs === hastaMs) return 0;

  const invertido = hastaMs < desdeMs;
  const totalMs = invertido
    ? milisegundosHabilesEnOrden(hasta, desde)
    : milisegundosHabilesEnOrden(desde, hasta);
  if (totalMs === 0) return 0;
  return (invertido ? -totalMs : totalMs) / HORA_MS;
}

/** Horas habiles que faltan para el vencimiento; son negativas si ya vencio. */
export function calcularHorasHabilesRestantes(
  fechaLimite: Date,
  ahora = new Date(),
): number {
  return calcularHorasHabilesEntre(ahora, fechaLimite);
}

/**
 * Promueve la prioridad por cercania al SLA sin reducir nunca una prioridad
 * que ya era mayor. A 24 horas pasa a alta y a 12 horas (o vencido), urgente.
 */
export function calcularPrioridadPorSla(
  prioridadActual: PrioridadSla,
  horasHabilesRestantes: number,
): PrioridadSla {
  if (!PRIORIDADES_SLA.includes(prioridadActual)) {
    throw new RangeError("La prioridad actual no es valida");
  }
  if (!Number.isFinite(horasHabilesRestantes)) {
    throw new RangeError("Las horas habiles restantes deben ser finitas");
  }

  const prioridadPorTiempo: PrioridadSla =
    horasHabilesRestantes <= PRIORIDAD_URGENTE_UMBRAL_HORAS
      ? "urgente"
      : horasHabilesRestantes <= PRIORIDAD_ALTA_UMBRAL_HORAS
        ? "alta"
        : prioridadActual;

  return RANGO_PRIORIDAD[prioridadPorTiempo] > RANGO_PRIORIDAD[prioridadActual]
    ? prioridadPorTiempo
    : prioridadActual;
}

function validarEntrada(fecha: Date, horas: number): void {
  if (Number.isNaN(fecha.getTime())) {
    throw new RangeError("La fecha base del SLA no es válida");
  }
  if (!Number.isFinite(horas) || horas < 0) {
    throw new RangeError("Las horas hábiles deben ser un número finito no negativo");
  }
}

/**
 * Suma horas hábiles en la zona de negocio.
 *
 * De lunes a viernes cuentan las 24 horas del día. Sábado y domingo no
 * consumen plazo; si el inicio cae en fin de semana, el reloj comienza el
 * lunes a las 00:00. No contempla feriados.
 */
export function sumarHorasHabiles(
  fecha: Date,
  horas: number,
): Date {
  validarEntrada(fecha, horas);
  if (horas === 0) return new Date(fecha.getTime());

  const cursor = new TZDateMini(fecha.getTime(), SLA_TIME_ZONE);
  let restanteMs = horas * HORA_MS;

  while (restanteMs > 0) {
    const dia = cursor.getDay();

    if (dia === 6) {
      cursor.setDate(cursor.getDate() + 2);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    if (dia === 0) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    const proximaMedianoche = new TZDateMini(cursor.getTime(), SLA_TIME_ZONE);
    proximaMedianoche.setDate(proximaMedianoche.getDate() + 1);
    proximaMedianoche.setHours(0, 0, 0, 0);
    const disponibleMs = proximaMedianoche.getTime() - cursor.getTime();

    if (restanteMs <= disponibleMs) {
      cursor.setTime(cursor.getTime() + restanteMs);
      restanteMs = 0;
    } else {
      restanteMs -= disponibleMs;
      cursor.setTime(proximaMedianoche.getTime());
    }
  }

  return new Date(cursor.getTime());
}

export function calcularFechaLimiteSla(fechaCreacion = new Date()): Date {
  return sumarHorasHabiles(fechaCreacion, SLA_HORAS_HABILES);
}
