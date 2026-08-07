import { PASSWORD_MAX_LENGTH } from "@workspace/password-policy";
import { getNewPasswordError } from "./password-policy.ts";

export const PASSWORD_CHANGE_PATH = "/cambiar-contrasena";
export const AUTHENTICATED_HOME_PATH = "/dashboard";

export interface PasswordChangeFields {
  currentPassword: string;
  newPassword: string;
  repeatedPassword: string;
}

export function getAuthenticatedEntryPath(user: {
  debe_cambiar_password?: boolean;
}): string {
  return user.debe_cambiar_password !== false
    ? PASSWORD_CHANGE_PATH
    : AUTHENTICATED_HOME_PATH;
}

export function getCurrentPasswordError(password: string): string | null {
  if (!password) return "Ingresá tu contraseña temporal.";
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña temporal no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return null;
}

export function getChangedPasswordError(
  currentPassword: string,
  newPassword: string,
): string | null {
  const policyError = getNewPasswordError(newPassword);
  if (policyError) return policyError;
  if (newPassword === currentPassword) {
    return "La contraseña nueva debe ser diferente de la temporal.";
  }
  return null;
}

export function getRepeatedPasswordError(
  newPassword: string,
  repeatedPassword: string,
): string | null {
  if (!repeatedPassword) return "Repetí la contraseña nueva.";
  if (repeatedPassword !== newPassword) return "Las contraseñas no coinciden.";
  return null;
}

export function getPasswordChangeFormError({
  currentPassword,
  newPassword,
  repeatedPassword,
}: PasswordChangeFields): string | null {
  return (
    getCurrentPasswordError(currentPassword) ??
    getChangedPasswordError(currentPassword, newPassword) ??
    getRepeatedPasswordError(newPassword, repeatedPassword)
  );
}
