export const NEW_PASSWORD_MIN_LENGTH = 16;
export const LOGIN_PASSWORD_MIN_LENGTH = 1;
export const PASSWORD_MAX_LENGTH = 128;
export const NEW_PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH;

export type NewPasswordViolation =
  | "too_short"
  | "too_long"
  | "control_character"
  | "outer_whitespace"
  | "blocked";

// Lista corta y deliberadamente explícita: bloquea credenciales públicas,
// placeholders y patrones obvios del sistema. No pretende reemplazar un
// servicio de contraseñas filtradas ni imponer reglas de composición.
export const BLOCKED_NEW_PASSWORDS = [
  "1234567890123456",
  "adminadminadminadmin",
  "administradoradministrador",
  "changemechangeme",
  "contrasenacontrasena",
  "contraseñacontraseña",
  "generar-otra-clave-larga-y-aleatoria",
  "generar-una-clave-larga-y-aleatoria",
  "generar-una-clave-inicial-larga-y-unica",
  "iloveyouiloveyou",
  "not-used-by-backup",
  "not-used-for-readonly-command",
  "passwordpassword",
  "qwertyqwertyqwerty",
  "sysadminsysadmin",
  "ticketmanagerticketmanager",
] as const;

const BLOCKED_PASSWORDS = new Set<string>(BLOCKED_NEW_PASSWORDS);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

function normalizeForBlocklist(password: string): string {
  return password.normalize("NFKC").toLocaleLowerCase("es");
}

function isSingleRepeatedCharacter(password: string): boolean {
  const characters = Array.from(normalizeForBlocklist(password));
  return (
    characters.length > 1 &&
    characters.every((character) => character === characters[0])
  );
}

export function getNewPasswordViolation(
  password: string,
): NewPasswordViolation | null {
  if (password.length < NEW_PASSWORD_MIN_LENGTH) return "too_short";
  if (password.length > NEW_PASSWORD_MAX_LENGTH) return "too_long";
  if (CONTROL_CHARACTER_PATTERN.test(password)) return "control_character";
  if (password !== password.trim()) return "outer_whitespace";
  if (
    BLOCKED_PASSWORDS.has(normalizeForBlocklist(password)) ||
    isSingleRepeatedCharacter(password)
  ) {
    return "blocked";
  }
  return null;
}
