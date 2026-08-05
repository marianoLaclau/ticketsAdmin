import {
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  getNewPasswordViolation,
} from "@workspace/password-policy";

export const NEW_PASSWORD_HELP = `Usá entre ${NEW_PASSWORD_MIN_LENGTH} y ${NEW_PASSWORD_MAX_LENGTH} caracteres, sin controles ni espacios al principio o al final, y evitá claves predecibles.`;

export function getNewPasswordError(password: string): string | null {
  const violation = getNewPasswordViolation(password);
  switch (violation) {
    case "too_short":
      return `Usá al menos ${NEW_PASSWORD_MIN_LENGTH} caracteres.`;
    case "too_long":
      return `Usá como máximo ${NEW_PASSWORD_MAX_LENGTH} caracteres.`;
    case "control_character":
      return "La contraseña no puede contener saltos de línea, tabulaciones ni otros caracteres de control.";
    case "outer_whitespace":
      return "Quitá los espacios del principio y del final.";
    case "blocked":
      return "Elegí una contraseña menos predecible; esa clave es común, repetitiva o de ejemplo.";
    case null:
      return null;
    default: {
      const exhaustiveCheck: never = violation;
      return exhaustiveCheck;
    }
  }
}

export { NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MIN_LENGTH };
