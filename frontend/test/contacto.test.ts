import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getContactDisplayEmail,
  getContactDisplayName,
  SIN_NOMBRE_PROPORCIONADO,
} from '../src/lib/contacto.ts';

test('arma y limpia el nombre completo', () => {
  assert.equal(getContactDisplayName({ nombre: ' Ana ', apellido: ' Pérez ' }), 'Ana Pérez');
  assert.equal(getContactDisplayName({ nombre: '', apellido: 'Pérez' }), 'Pérez');
});

test('muestra el fallback cuando no se proporcionó ningún nombre', () => {
  assert.equal(getContactDisplayName({ nombre: ' ', apellido: '' }), SIN_NOMBRE_PROPORCIONADO);
  assert.equal(getContactDisplayName({ nombre: 'Sin nombre', apellido: null }), SIN_NOMBRE_PROPORCIONADO);
  assert.equal(getContactDisplayName(), SIN_NOMBRE_PROPORCIONADO);
});

test('normaliza el email solo para su presentación', () => {
  assert.equal(getContactDisplayEmail(' persona@empresa.com '), 'persona@empresa.com');
  assert.equal(getContactDisplayEmail('   '), null);
  assert.equal(getContactDisplayEmail(null), null);
});
