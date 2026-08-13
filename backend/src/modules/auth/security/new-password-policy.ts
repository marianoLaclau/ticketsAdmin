import {
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  getNewPasswordViolation,
} from "@workspace/password-policy";

// Adaptacion HTTP de la politica compartida para contrasenas nuevas.

/**
 * Mensaje de negocio compartido por alta, reset y cambio propio. Los tipos y
 * campos ausentes siguen siendo responsabilidad del contrato Zod generado.
 */
export function getNewPasswordPolicyError(password: unknown): string | null {
  if (typeof password !== "string") return null;

  const violation = getNewPasswordViolation(password);
  switch (violation) {
    case null:
      return null;
    case "too_short":
    case "too_long":
      return `La contraseña debe tener entre ${NEW_PASSWORD_MIN_LENGTH} y ${NEW_PASSWORD_MAX_LENGTH} caracteres`;
    case "control_character":
      return "La contraseña no puede contener caracteres de control";
    case "outer_whitespace":
      return "La contraseña no puede comenzar ni terminar con espacios";
    case "blocked":
      return "La contraseña elegida es demasiado predecible, repetitiva o corresponde a un ejemplo público";
    default: {
      const exhaustiveCheck: never = violation;
      return exhaustiveCheck;
    }
  }
}
