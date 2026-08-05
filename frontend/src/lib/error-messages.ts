const DEFAULT_ERROR_MESSAGE = 'No pudimos completar la operación. Intentá nuevamente.';
const CONNECTION_ERROR_MESSAGE = 'No pudimos conectar con el servidor. Verificá tu conexión e intentá nuevamente.';

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
  return typeof response?.status === 'number' && Number.isInteger(response.status) ? response.status : undefined;
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

export function getServerErrorCode(error: unknown): string {
  const payload = asRecord(asRecord(error)?.data);
  return typeof payload?.code === 'string' ? payload.code : '';
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
    if (message.includes('principio') || message.includes('comenzar') || message.includes('terminar con espacios')) {
      return 'La contraseña no puede tener espacios al principio ni al final.';
    }
    if (message.includes('caracteres de control')) {
      return 'La contraseña no puede contener saltos de línea, tabulaciones ni otros caracteres de control.';
    }
    if (message.includes('comun') || message.includes('predecible') || message.includes('ejemplo publico')) {
      return 'Elegí una contraseña menos predecible; esa clave es común, repetitiva o de ejemplo.';
    }
    if (message.includes('16') || message.includes('128') || message.includes('corta') || message.includes('least')) {
      return 'La contraseña debe tener entre 16 y 128 caracteres.';
    }
  }

  if (message.includes('ya existe un rol')) {
    return 'Ya existe un rol con ese nombre.';
  }
  if (message.includes('nombre') && message.includes('reservado') && message.includes('rol')) {
    return 'Ese nombre está reservado para un rol del sistema.';
  }
  if (message.includes('roles del sistema')) {
    if (message.includes('renombrar')) return 'Los roles del sistema no se pueden renombrar.';
    if (message.includes('permanecer activos')) return 'Los roles del sistema deben permanecer activos.';
    if (message.includes('eliminar')) return 'Los roles del sistema no se pueden eliminar.';
  }
  if (message.includes('asignar un rol inactivo')) {
    return 'El rol seleccionado está inactivo. Elegí o activá otro rol.';
  }
  if (message.includes('permanecer al menos un sysadmin')) {
    return 'Debe quedar al menos un SysAdmin activo con credenciales utilizables.';
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

export function getUserErrorMessage(error: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
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

export function getPasswordChangeErrorMessage(error: unknown): string {
  switch (getServerErrorCode(error)) {
    case 'CURRENT_PASSWORD_INVALID':
      return 'La contraseña temporal no es correcta.';
    case 'PASSWORD_REUSE_NOT_ALLOWED':
      return 'La contraseña nueva debe ser diferente de la temporal.';
    case 'PASSWORD_CHANGE_REQUIRED':
      return 'Tenés que crear tu contraseña definitiva antes de continuar.';
    case 'SESSION_INVALID':
    case 'SESSION_CHANGED':
      return 'Tu sesión cambió o venció. Volvé a iniciar sesión.';
    case 'NEW_PASSWORD_POLICY_VIOLATION':
      return getUserErrorMessage(error);
    default:
      return getUserErrorMessage(
        error,
        'No pudimos cambiar la contraseña. Revisá los datos e intentá nuevamente.',
      );
  }
}
