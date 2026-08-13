export const normalizeRequiredText = (value: string): string => value.trim();

export const normalizeOptionalText = (
  value: string | null | undefined,
): string | null => {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
};

export const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export const readPasswordFromBody = (body: unknown): unknown => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return (body as { password?: unknown }).password;
};

export const hasSqliteConstraint = (
  error: unknown,
  constraint: string,
): boolean => {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code.includes(constraint)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};
