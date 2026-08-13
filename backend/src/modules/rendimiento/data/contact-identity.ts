import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/** Normalizacion compartida por Calidad de datos y Reiteraciones. */
export const normalizedContactText = (column: AnyColumn): SQL<string> =>
  sql<string>`lower(trim(coalesce(${column}, '')))`;

export function normalizedContactDigits(column: AnyColumn): SQL<string> {
  return sql<string>`replace(replace(replace(replace(replace(replace(replace(
    ${normalizedContactText(column)}, ' ', ''), '.', ''), '-', ''), '(', ''), ')', ''), '+', ''), '/', '')`;
}

export function usableNumericContactIdentity(
  column: AnyColumn,
  minimumLength: number,
  maximumLength: number,
): SQL<boolean> {
  const normalized = normalizedContactDigits(column);
  return sql<boolean>`length(${normalized}) between ${minimumLength} and ${maximumLength}
    and ${normalized} not glob '*[^0-9]*'
    and replace(${normalized}, substr(${normalized}, 1, 1), '') <> ''`;
}

export function usableDniContactIdentity(column: AnyColumn): SQL<boolean> {
  return usableNumericContactIdentity(column, 7, 11);
}

export function usablePhoneContactIdentity(column: AnyColumn): SQL<boolean> {
  const normalized = normalizedContactDigits(column);
  const subscriberTail = sql<string>`substr(${normalized}, -7)`;
  return sql<boolean>`${usableNumericContactIdentity(column, 7, 15)}
    and replace(${subscriberTail}, substr(${subscriberTail}, 1, 1), '') <> ''`;
}

export function usableEmailContactIdentity(column: AnyColumn): SQL<boolean> {
  const normalized = normalizedContactText(column);
  const local = sql<string>`substr(${normalized}, 1, instr(${normalized}, '@') - 1)`;
  const compactLocal = sql<string>`replace(replace(replace(${local}, '.', ''), '-', ''), '_', '')`;
  const domain = sql<string>`substr(${normalized}, instr(${normalized}, '@') + 1)`;
  return sql<boolean>`length(${normalized}) between 5 and 254
    and instr(${normalized}, ' ') = 0
    and instr(${normalized}, char(9)) = 0
    and instr(${normalized}, char(10)) = 0
    and instr(${normalized}, char(13)) = 0
    and instr(${normalized}, '@') > 1
    and instr(${domain}, '@') = 0
    and instr(${domain}, '.') > 1
    and substr(${domain}, -1) <> '.'
    and ${compactLocal} not in (
      'sinemail', 'sincorreo', 'noemail', 'nocorreo', 'noinforma',
      'noinformado', 'noinformada', 'sindato', 'sindatos',
      'ninguno', 'ninguna'
    )`;
}

export const nonBlankContactText = (column: AnyColumn): SQL<boolean> =>
  sql<boolean>`${normalizedContactText(column)} <> ''`;
