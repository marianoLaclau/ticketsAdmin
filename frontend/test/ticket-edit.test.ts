import assert from 'node:assert/strict';
import test from 'node:test';
import type { Ticket } from '@workspace/api-client-react';
import {
  applyTicketManagementState,
  buildTicketManagementUpdate,
  buildFunctionalTicketUpdateFromBaseline,
  getFunctionalFieldLabel,
  isValidOptionalEmail,
  ticketToFunctionalForm,
  ticketToManagementForm,
} from '../src/lib/ticket-edit.ts';

const ticket = {
  id: 1,
  version: 1,
  conversation_id: 'conv-1',
  hora: '10:30',
  nombre: 'Ana',
  apellido: 'Pérez',
  telefono: null,
  dni: '123',
  empresa: null,
  estado_empleado: null,
  email: 'ana@example.com',
  motivo: 'Consulta',
  motivo_categoria: 'contacto_general',
  resumen: null,
  notificado: false,
  estado: 'nuevo',
  prioridad: 'media',
  asignado_usuario_id: null,
  asignado_a: null,
  audio_url: null,
  notas: null,
  progreso: 0,
  fecha_creacion: '2026-08-05T13:30:00Z',
  fecha_limite: null,
  fecha_resolucion: null,
} as Ticket;

test('construye un PATCH mínimo y normaliza opcionales vacíos a null', () => {
  const baseline = ticketToFunctionalForm(ticket);
  const form = { ...baseline };
  form.nombre = ' Ana '; // mismo valor normalizado
  form.telefono = ' 11 5555-0000 ';
  form.dni = '   ';
  form.empresa = ' GSB ';
  form.resumen = 'Dato completado';

  assert.deepEqual(buildFunctionalTicketUpdateFromBaseline(baseline, form), {
    telefono: '11 5555-0000',
    dni: null,
    empresa: 'GSB',
    resumen: 'Dato completado',
  });
});

test('omite todos los campos cuando no hubo cambios reales', () => {
  const baseline = ticketToFunctionalForm(ticket);
  assert.deepEqual(
    buildFunctionalTicketUpdateFromBaseline(baseline, { ...baseline }),
    {},
  );
});

test('datos funcionales comparan contra el baseline de apertura, no contra SSE', () => {
  const baseline = ticketToFunctionalForm(ticket);
  const form = { ...baseline, email: 'nuevo@example.com' };

  // Representa una actualización remota recibida mientras el diálogo estaba
  // abierto. No forma parte del baseline ni del draft local.
  const ticketRefreshedBySse = { ...ticket, telefono: '11 9999-0000' };
  assert.equal(
    ticketToFunctionalForm(ticketRefreshedBySse).telefono,
    '11 9999-0000',
  );
  assert.deepEqual(buildFunctionalTicketUpdateFromBaseline(baseline, form), {
    email: 'nuevo@example.com',
  });
});

test('gestión envía solo los campos realmente modificados', () => {
  const baseline = ticketToManagementForm(ticket, '2026-08-05T10:30');
  const draft = {
    ...baseline,
    prioridad: 'urgente' as const,
    notas: '  Requiere revisión  ',
  };

  assert.deepEqual(buildTicketManagementUpdate(baseline, draft), {
    prioridad: 'urgente',
    notas: 'Requiere revisión',
  });
});

test('un cambio de estado envía su progreso coherente sin snapshots ajenos', () => {
  const baseline = ticketToManagementForm(ticket);
  const draft = applyTicketManagementState(baseline, 'pendiente');

  assert.deepEqual(buildTicketManagementUpdate(baseline, draft), {
    estado: 'pendiente',
    progreso: 50,
  });
});

test('respeta un ajuste manual de progreso posterior al cambio de estado', () => {
  const baseline = ticketToManagementForm(ticket);
  const changedState = applyTicketManagementState(baseline, 'pendiente');
  const draft = { ...changedState, progreso: 65 };

  assert.deepEqual(buildTicketManagementUpdate(baseline, draft), {
    estado: 'pendiente',
    progreso: 65,
  });
});

test('volver al estado original restaura también su progreso inicial', () => {
  const ticketWithHistoricalProgress = { ...ticket, progreso: 15 };
  const baseline = ticketToManagementForm(ticketWithHistoricalProgress);
  const changedState = applyTicketManagementState(
    baseline,
    'pendiente',
    baseline,
  );
  const reverted = applyTicketManagementState(
    changedState,
    baseline.estado,
    baseline,
  );

  assert.equal(reverted.progreso, 15);
  assert.deepEqual(buildTicketManagementUpdate(baseline, reverted), {});
});

test('permite cambiar solo progreso y borrar notas con null', () => {
  const baseline = ticketToManagementForm({
    ...ticket,
    notas: 'Dato anterior',
  });
  const draft = { ...baseline, progreso: 35, notas: '   ' };

  assert.deepEqual(buildTicketManagementUpdate(baseline, draft), {
    progreso: 35,
    notas: null,
  });
});

test('no genera un PATCH cuando la gestión conserva el snapshot de apertura', () => {
  const baseline = ticketToManagementForm(ticket, '2026-08-05T10:30');

  assert.deepEqual(buildTicketManagementUpdate(baseline, { ...baseline }), {});
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
