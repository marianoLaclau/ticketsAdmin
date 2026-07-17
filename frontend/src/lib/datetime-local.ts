const padTwoDigits = (value: number) => String(value).padStart(2, '0');

/**
 * Convierte un instante a la representación local que espera un input
 * `datetime-local`. No usa UTC porque el control representa la zona horaria
 * del navegador.
 */
export function toDateTimeLocalValue(value: string | Date | null | undefined): string {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return [
    `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())}`,
    `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`,
  ].join('T');
}

/**
 * Interpreta el valor de un `datetime-local` en la zona horaria del navegador
 * y devuelve el instante ISO que consume la API.
 */
export function dateTimeLocalValueToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  // Evita que Date normalice silenciosamente valores imposibles (por ejemplo,
  // 31 de febrero o una hora inexistente durante un cambio de DST).
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date.toISOString();
}
