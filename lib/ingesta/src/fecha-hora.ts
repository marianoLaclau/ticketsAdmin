import { TZDateMini } from "@date-fns/tz";
import { SLA_TIME_ZONE } from "./sla";

interface PartesFechaLocal {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

function fechaLocalEnBuenosAires(partes: PartesFechaLocal): Date | null {
  const { year, month, day, hours, minutes, seconds, milliseconds } = partes;

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59 ||
    milliseconds < 0 ||
    milliseconds > 999
  ) {
    return null;
  }

  const local = new TZDateMini(
    year,
    month - 1,
    day,
    hours,
    minutes,
    seconds,
    milliseconds,
    SLA_TIME_ZONE,
  );

  // TZDate, igual que Date, normaliza 31/02 a marzo. Comparar las partes evita
  // importar silenciosamente una fecha de calendario imposible.
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hours ||
    local.getMinutes() !== minutes ||
    local.getSeconds() !== seconds ||
    local.getMilliseconds() !== milliseconds
  ) {
    return null;
  }

  return new Date(local.getTime());
}

export interface HoraLocal {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

export function parseHoraLocal(raw: string): HoraLocal | null {
  const valor = raw.trim();
  if (!valor) return null;

  // Acepta HH:mm, HH:mm:ss(.SSS) y la representación ISO local que produce
  // fechaExcelAStringLocal para una celda de hora de Excel.
  const match = valor.match(
    /^(?:\d{4}-\d{2}-\d{2}[T\s])?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(?:hs?)?$/i,
  );
  if (!match) return null;

  const [, h, mi, s = "0", ms = "0"] = match;
  const parsed = {
    hours: Number(h),
    minutes: Number(mi),
    seconds: Number(s),
    milliseconds: Number(ms.padEnd(3, "0")),
  };

  return parsed.hours <= 23 && parsed.minutes <= 59 && parsed.seconds <= 59
    ? parsed
    : null;
}

export function parseFecha(s: string): Date | null {
  const valor = s.trim();
  if (!valor) return null;

  // dd/mm/yyyy con hora opcional en formatos "hh:mm", "- hh:mm", "- hh:mmhs"
  const dmy = valor.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*[-–]?\s*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(?:hs?)?)?$/i,
  );
  if (dmy) {
    // Los tres primeros grupos son obligatorios en el patrón; el default los
    // hace explícitos para los consumidores con índices verificados.
    const [
      ,
      d = "",
      mo = "",
      y = "",
      h = "0",
      mi = "0",
      seconds = "0",
      ms = "0",
    ] = dmy;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return fechaLocalEnBuenosAires({
      year,
      month: Number(mo),
      day: Number(d),
      hours: Number(h),
      minutes: Number(mi),
      seconds: Number(seconds),
      milliseconds: Number(ms.padEnd(3, "0")),
    });
  }

  // ISO sin zona representa la fecha/hora de negocio, no la zona del proceso.
  const isoLocal = valor.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/,
  );
  if (isoLocal) {
    const [, y, mo, d, h = "0", mi = "0", seconds = "0", ms = "0"] = isoLocal;
    return fechaLocalEnBuenosAires({
      year: Number(y),
      month: Number(mo),
      day: Number(d),
      hours: Number(h),
      minutes: Number(mi),
      seconds: Number(seconds),
      milliseconds: Number(ms.padEnd(3, "0")),
    });
  }

  // Un ISO con Z u offset sí expresa un instante absoluto y se conserva.
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i.test(valor)) {
    return null;
  }
  const parsed = new Date(valor);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Excel no guarda zona horaria. ExcelJS representa sus componentes de pared
 * dentro de un Date usando UTC; quitar la Z permite reinterpretarlos luego en
 * la zona de negocio sin desplazar la celda al día anterior.
 */
export function fechaExcelAStringLocal(fecha: Date): string {
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toISOString().slice(0, -1);
}

export function aplicarHoraLocal(fecha: Date, hora: HoraLocal): Date | null {
  const local = new TZDateMini(fecha.getTime(), SLA_TIME_ZONE);
  return fechaLocalEnBuenosAires({
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    ...hora,
  });
}
