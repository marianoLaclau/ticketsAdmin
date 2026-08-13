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
    and ${normalized} not glob '*[^0-9]*'`;
}

export function usableEmailContactIdentity(column: AnyColumn): SQL<boolean> {
  const normalized = normalizedContactText(column);
  const domain = sql<string>`substr(${normalized}, instr(${normalized}, '@') + 1)`;
  return sql<boolean>`length(${normalized}) between 5 and 254
    and instr(${normalized}, ' ') = 0
    and instr(${normalized}, char(9)) = 0
    and instr(${normalized}, char(10)) = 0
    and instr(${normalized}, char(13)) = 0
    and instr(${normalized}, '@') > 1
    and instr(${domain}, '@') = 0
    and instr(${domain}, '.') > 1
    and substr(${domain}, -1) <> '.'`;
}

export const nonBlankContactText = (column: AnyColumn): SQL<boolean> =>
  sql<boolean>`${normalizedContactText(column)} <> ''`;
