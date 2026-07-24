// RFC 3339 date-time: fecha completa, hora con segundos y zona obligatoria.
// Se valida el texto crudo antes de cualquier z.coerce.date(), que de otro
// modo convertiría null, false o 0 en el epoch de 1970.
const RFC3339_DATE_TIME_WITH_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isRfc3339DateTimeWithZone(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const match = RFC3339_DATE_TIME_WITH_ZONE.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const zoneHour = match[8] === undefined ? 0 : Number(match[8]);
  const zoneMinute = match[9] === undefined ? 0 : Number(match[9]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (zoneHour > 23 || zoneMinute > 59) return false;

  return Number.isFinite(Date.parse(value));
}

export function findInvalidRfc3339DateTimeField<T extends string>(
  body: Record<string, unknown>,
  fields: readonly T[],
): T | null {
  for (const field of fields) {
    if (
      Object.prototype.hasOwnProperty.call(body, field) &&
      !isRfc3339DateTimeWithZone(body[field])
    ) {
      return field;
    }
  }
  return null;
}
