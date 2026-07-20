import assert from 'node:assert/strict';
import test from 'node:test';
import { getEstadoLabel } from '../src/lib/estados.ts';

test('aclara que un ticket pendiente ya fue contactado', () => {
  assert.equal(getEstadoLabel('pendiente'), 'Pendiente (fue contactado)');
});

test('mantiene las etiquetas de los demás estados', () => {
  assert.equal(getEstadoLabel('nuevo'), 'Nuevo');
  assert.equal(getEstadoLabel('en_proceso'), 'En Proceso');
  assert.equal(getEstadoLabel('resuelto'), 'Resuelto');
  assert.equal(getEstadoLabel('cerrado'), 'Cerrado');
});

test('presenta estados desconocidos sin guiones bajos', () => {
  assert.equal(getEstadoLabel('estado_nuevo'), 'estado nuevo');
});
