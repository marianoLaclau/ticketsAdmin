import assert from 'node:assert/strict';
import test from 'node:test';
import { getEstadoEmpleadoConfig } from '../src/lib/estado-empleado.ts';

test('presenta Activo o Inactivo cuando existe una empresa', () => {
  assert.equal(getEstadoEmpleadoConfig('GSB', 'Activo')?.label, 'Activo');
  assert.equal(getEstadoEmpleadoConfig('GSB', 'Inactivo')?.label, 'Inactivo');
});

test('tolera espacios y mayúsculas al presentar el dato', () => {
  assert.equal(getEstadoEmpleadoConfig(' GSB ', ' ACTIVO ')?.label, 'Activo');
});

test('no presenta el estado cuando el ticket no tiene empresa', () => {
  assert.equal(getEstadoEmpleadoConfig(null, 'Activo'), null);
  assert.equal(getEstadoEmpleadoConfig('   ', 'Inactivo'), null);
  assert.equal(getEstadoEmpleadoConfig('Sin empresa asignada', 'Activo'), null);
  assert.equal(getEstadoEmpleadoConfig('Sin empresa asociada', 'Inactivo'), null);
});

test('no inventa una etiqueta para estados ausentes o desconocidos', () => {
  assert.equal(getEstadoEmpleadoConfig('GSB', null), null);
  assert.equal(getEstadoEmpleadoConfig('GSB', 'suspendido'), null);
});
