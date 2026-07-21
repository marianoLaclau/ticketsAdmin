import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAdminErrorMessage,
  getApiErrorStatus,
  getLoginErrorMessage,
  getUserErrorMessage,
} from '../src/lib/error-messages.ts';

function apiError(status: number, serverError: string, technicalMessage = 'detalle técnico') {
  return Object.assign(new Error(`HTTP ${status}: ${technicalMessage}`), {
    status,
    data: { error: serverError, details: [{ path: ['password'], code: 'too_small' }] },
  });
}

test('nunca muestra el mensaje técnico del Error', () => {
  const result = getUserErrorMessage(
    apiError(400, 'Invalid body', 'password: String must contain at least 6 character(s)'),
  );

  assert.equal(result, 'Revisá los datos ingresados e intentá nuevamente.');
  assert.doesNotMatch(result, /HTTP|String|password|code/i);
});

test('extrae el estado solamente desde datos estructurados', () => {
  assert.equal(getApiErrorStatus({ response: { status: 403 }, message: 'HTTP 500' }), 403);
  assert.equal(getApiErrorStatus(new Error('HTTP 401 Unauthorized')), undefined);
});

test('traduce conflictos de negocio conocidos sin copiar la respuesta cruda', () => {
  assert.equal(
    getUserErrorMessage(apiError(409, 'Ya existe un usuario con ese email o nombre de usuario')),
    'El email o el nombre de usuario ya está en uso.',
  );
  assert.equal(
    getUserErrorMessage(apiError(409, 'No se puede eliminar un rol con usuarios asignados')),
    'No se puede eliminar un rol que tiene usuarios asignados. Podés desactivarlo.',
  );
});

test('las acciones administrativas explican la clave inválida sin datos HTTP', () => {
  assert.equal(
    getAdminErrorMessage(apiError(401, 'Clave de administración inválida')),
    'Clave de administración inválida. Revisala arriba a la derecha.',
  );
});

test('un 401 administrativo por sesión vencida no se confunde con la clave', () => {
  assert.equal(
    getAdminErrorMessage(apiError(401, 'Sesión inválida o expirada')),
    'Tu sesión venció o no es válida. Volvé a iniciar sesión.',
  );
});

test('el login diferencia credenciales inválidas y problemas de conexión', () => {
  assert.equal(
    getLoginErrorMessage(apiError(401, 'Usuario o contraseña incorrectos')),
    'Usuario o contraseña incorrectos.',
  );
  assert.match(getLoginErrorMessage(new TypeError('Failed to fetch')), /conectar con el servidor/i);
});

test('el login no presenta una validación HTTP como un problema de conexión', () => {
  assert.match(getLoginErrorMessage(apiError(400, 'Invalid body')), /Revisá el usuario/i);
  assert.match(getLoginErrorMessage(apiError(403, 'Cuenta bloqueada')), /no tiene permitido/i);
});

test('respeta un fallback amigable para errores no clasificados', () => {
  const result = getUserErrorMessage(new Error('stack trace interno'), 'No se pudo guardar. Reintentá.');
  assert.equal(result, 'No se pudo guardar. Reintentá.');
});
