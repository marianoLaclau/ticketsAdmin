import { TZDateMini } from "@date-fns/tz";

const HORA_MS = 60 * 60 * 1000;

export const SLA_HORAS_HABILES = 48;
export const SLA_TIME_ZONE = "America/Argentina/Buenos_Aires";

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
