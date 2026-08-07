export function joinBasePath(baseUrl: string, path = ""): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const relativePath = path.replace(/^\/+/, "");
  return `${normalizedBase}${relativePath}`;
}

export function getAppHref(path = ""): string {
  return joinBasePath(import.meta.env.BASE_URL, path);
}
