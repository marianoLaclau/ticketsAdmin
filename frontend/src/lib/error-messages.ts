const DEFAULT_ERROR_MESSAGE = 'No pudimos completar la operación. Intentá nuevamente.';
const CONNECTION_ERROR_MESSAGE =
  'No pudimos conectar con el servidor. Verificá tu conexión e intentá nuevamente.';

type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | undefined {
  return value !== null && typeof value === 'object' ? (value as ErrorRecord) : undefined;
}

/**
 * Obtiene el estado HTTP desde los campos estructurados del cliente API.
 * Deliberadamente no analiza `Error.message`: ese texto contiene el método,
 * la URL y detalles del servidor que no deben terminar en la interfaz.
 */
export function getApiErrorStatus(error: unknown): number | undefined {
  const record = asRecord(error);
  if (!record) return undefined;

  if (typeof record.status === 'number' && Number.isInteger(record.status)) {
    return record.status;
  }

  const response = asRecord(record.response);
  return typeof response?.status === 'number' && Number.isInteger(response.status)
    ? response.status
    : undefined;
}

function getServerErrorText(error: unknown): string {
  const payload = asRecord(asRecord(error)?.data);
  if (!payload) return '';

  for (const key of ['error', 'detail', 'message']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

/** Solo traduce respuestas de negocio conocidas; nunca devuelve texto crudo. */
function knownBusinessMessage(error: unknown): string | undefined {
  const message = normalize(getServerErrorText(error));
  if (!message) return undefined;

  if (message.includes('contrasen') || message.includes('password')) {
    if (message.includes('coincid') || message.includes('match')) {
      return 'Las contraseñas no coinciden. Revisá ambos campos.';
    }
    if (message.includes('6') || message.includes('corta') || message.includes('least')) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
  }

  if (message.includes('ya existe un rol')) {
    return 'Ya existe un rol con ese nombre.';
  }
  if (message.includes('rol con usuarios asignados')) {
    return 'No se puede eliminar un rol que tiene usuarios asignados. Podés desactivarlo.';
  }
  if (message.includes('rol indicado no existe') || message.includes('rol no encontrado')) {
    return 'El rol seleccionado ya no está disponible.';
  }
  if (message.includes('ya existe un usuario')) {
    if (message.includes('email') && message.includes('nombre de usuario')) {
      return 'El email o el nombre de usuario ya está en uso.';
    }
    if (message.includes('email')) return 'Ya existe un usuario con ese email.';
    return 'Ya existe un usuario con ese nombre de usuario.';
  }
  if (message.includes('ya existe un ticket') || message.includes('conversation_id')) {
    return 'Ya existe un ticket con ese identificador de conversación.';
  }
  if (message.includes('solo un administrador puede cerrar')) {
    return 'Solo un administrador puede cerrar tickets.';
  }
  if (message.includes('usuario no encontrado')) {
    return 'El usuario ya no existe o no está disponible.';
  }
  if (message.includes('ticket not found') || message.includes('ticket no encontrado')) {
    return 'El ticket ya no existe o no está disponible.';
  }

  return undefined;
}

export function getUserErrorMessage(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): string {
  const businessMessage = knownBusinessMessage(error);
  if (businessMessage) return businessMessage;

  switch (getApiErrorStatus(error)) {
    case 400:
    case 422:
      return 'Revisá los datos ingresados e intentá nuevamente.';
    case 401:
      return 'Tu sesión venció o no es válida. Volvé a iniciar sesión.';
    case 403:
      return 'No tenés permisos para realizar esta acción.';
    case 404:
      return 'El registro ya no existe o no está disponible.';
    case 409:
      return 'Los datos entran en conflicto con un registro existente.';
    case 413:
      return 'El archivo seleccionado es demasiado grande.';
    case 429:
      return 'Se realizaron demasiados intentos. Esperá un momento y volvé a probar.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'El servidor no pudo completar la operación. Intentá nuevamente en unos minutos.';
    default:
      return error instanceof TypeError ? CONNECTION_ERROR_MESSAGE : fallback;
  }
}

export function getAdminErrorMessage(error: unknown): string {
  const status = getApiErrorStatus(error);
  if (status === 401) {
    const serverMessage = normalize(getServerErrorText(error));
    if (serverMessage.includes('clave de administracion')) {
      return 'Clave de administración inválida. Revisala arriba a la derecha.';
    }
    return getUserErrorMessage(error);
  }
  if (status === 503) {
    return 'El acceso administrativo no está disponible en este momento.';
  }
  return getUserErrorMessage(error);
}

export function getLoginErrorMessage(error: unknown): string {
  switch (getApiErrorStatus(error)) {
    case 400:
    case 422:
      return 'Revisá el usuario y la contraseña e intentá nuevamente.';
    case 401:
      return 'Usuario o contraseña incorrectos.';
    case 403:
      return 'Tu usuario no tiene permitido ingresar al sistema.';
    case 429:
      return 'Demasiados intentos. Esperá un momento antes de volver a probar.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'El servicio no está disponible en este momento. Intentá nuevamente en unos minutos.';
    default:
      return CONNECTION_ERROR_MESSAGE;
  }
}
