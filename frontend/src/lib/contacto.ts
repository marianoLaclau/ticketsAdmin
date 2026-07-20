export const SIN_NOMBRE_PROPORCIONADO = 'Sin nombre proporcionado';

type Contacto = {
  nombre?: string | null;
  apellido?: string | null;
};

/**
 * Arma el nombre visible sin modificar los datos originales del ticket.
 * Los imports históricos usaban "Sin nombre" como marcador; en pantalla se
 * presenta con la leyenda actual y, si existe apellido, se conserva ese dato.
 */
export function getContactDisplayName(contacto?: Contacto | null): string {
  const nombre = contacto?.nombre?.trim() ?? '';
  const apellido = contacto?.apellido?.trim() ?? '';
  const nombreAusente = !nombre || /^sin nombre(?: proporcionado)?$/i.test(nombre);

  if (nombreAusente) return apellido || SIN_NOMBRE_PROPORCIONADO;
  return [nombre, apellido].filter(Boolean).join(' ');
}

/** Devuelve un email listo para mostrar, o null si llegó vacío/solo con espacios. */
export function getContactDisplayEmail(email?: string | null): string | null {
  return email?.trim() || null;
}

/** Devuelve un teléfono listo para mostrar, o null si llegó vacío/solo con espacios. */
export function getContactDisplayPhone(telefono?: string | null): string | null {
  return telefono?.trim() || null;
}
