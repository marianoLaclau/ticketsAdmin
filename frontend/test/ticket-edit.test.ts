import assert from 'node:assert/strict';
import test from 'node:test';
import type { Ticket } from '@workspace/api-client-react';
import {
  buildFunctionalTicketUpdate,
  getFunctionalFieldLabel,
  isValidOptionalEmail,
  ticketToFunctionalForm,
} from '../src/lib/ticket-edit.ts';

const ticket = {
  id: 1,
  conversation_id: 'conv-1',
  hora: '10:30',
  nombre: 'Ana',
  apellido: 'Pérez',
  telefono: null,
  dni: '123',
  empresa: null,
  email: 'ana@example.com',
  motivo: 'Consulta',
  motivo_categoria: 'contacto_general',
  resumen: null,
  notificado: false,
  estado: 'nuevo',
  prioridad: 'media',
  progreso: 0,
  fecha_creacion: new Date().toISOString(),
} as Ticket;

test('construye un PATCH mínimo y normaliza opcionales vacíos a null', () => {
  const form = ticketToFunctionalForm(ticket);
  form.nombre = ' Ana '; // mismo valor normalizado
  form.telefono = ' 11 5555-0000 ';
  form.dni = '   ';
  form.empresa = ' GSB ';
  form.resumen = 'Dato completado';

  assert.deepEqual(buildFunctionalTicketUpdate(ticket, form), {
    telefono: '11 5555-0000',
    dni: null,
    empresa: 'GSB',
    resumen: 'Dato completado',
  });
});

test('omite todos los campos cuando no hubo cambios reales', () => {
  assert.deepEqual(buildFunctionalTicketUpdate(ticket, ticketToFunctionalForm(ticket)), {});
});

test('expone etiquetas humanas para la auditoría', () => {
  assert.equal(getFunctionalFieldLabel('telefono'), 'Teléfono');
  assert.equal(getFunctionalFieldLabel('campo_futuro'), 'campo_futuro');
});

test('valida el email opcional antes de guardar', () => {
  assert.equal(isValidOptionalEmail(''), true);
  assert.equal(isValidOptionalEmail('  ana@example.com  '), true);
  assert.equal(isValidOptionalEmail('ana@'), false);
  assert.equal(isValidOptionalEmail('ana example.com'), false);
});
