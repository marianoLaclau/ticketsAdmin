export const SERIN_SEGUIMIENTO_AUTOR = "Sistema";
export const SERIN_SEGUIMIENTO_NOTA =
  "Los datos fueron extraídos y persistidos desde Serin con el DNI proporcionado.";

const EMPRESAS_NO_ASOCIADAS = new Set([
  "sin empresa asignada",
  "sin empresa asociada",
]);

export interface SeguimientoOrigenSerin {
  autor: typeof SERIN_SEGUIMIENTO_AUTOR;
  nota: typeof SERIN_SEGUIMIENTO_NOTA;
}

/**
 * Genera la entrada inicial de auditoría cuando Serin devolvió una empresa
 * real. Los marcadores de ausencia usados por n8n no cuentan como empresa.
 */
export function crearSeguimientoOrigenSerin(
  empresa: string | null | undefined,
): SeguimientoOrigenSerin | null {
  const empresaNormalizada = (empresa ?? "").trim().toLowerCase();
  if (
    !empresaNormalizada ||
    EMPRESAS_NO_ASOCIADAS.has(empresaNormalizada)
  ) {
    return null;
  }

  return {
    autor: SERIN_SEGUIMIENTO_AUTOR,
    nota: SERIN_SEGUIMIENTO_NOTA,
  };
}
