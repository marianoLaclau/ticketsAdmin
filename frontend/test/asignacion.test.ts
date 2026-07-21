import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAssignedDisplayName,
  hasAssignedDisplayName,
  SIN_ASIGNAR,
} from '../src/lib/asignacion.ts';

test('muestra el nombre del usuario asignado sin espacios laterales', () => {
  assert.equal(getAssignedDisplayName('  Ana Pérez  '), 'Ana Pérez');
});

test('muestra el fallback cuando el ticket no tiene usuario asignado', () => {
  assert.equal(getAssignedDisplayName(), SIN_ASIGNAR);
  assert.equal(getAssignedDisplayName(null), SIN_ASIGNAR);
  assert.equal(getAssignedDisplayName('   '), SIN_ASIGNAR);
});

test('un nombre literal Sin asignar sigue siendo una asignación real', () => {
  assert.equal(getAssignedDisplayName('Sin asignar'), SIN_ASIGNAR);
  assert.equal(hasAssignedDisplayName('Sin asignar'), true);
  assert.equal(hasAssignedDisplayName('  '), false);
});
