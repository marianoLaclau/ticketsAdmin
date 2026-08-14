import assert from "node:assert/strict";
import test from "node:test";
import type { Ticket } from "@workspace/api-client-react";
import {
  buildAdminTicketInput,
  buildAdminTicketUpdate,
  createEmptyAdminTicketForm,
  ticketToAdminTicketForm,
} from "../src/features/admin-tickets/admin-ticket-form.ts";

const ticket: Ticket = {
  id: 7,
  version: 1,
  conversation_id: "conv-7",
  hora: "10:30",
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "11 5555-0000",
  dni: null,
  empresa: "GSB",
  estado_empleado: "Activo",
  email: "ana@example.com",
  motivo: "Consulta",
  motivo_categoria: "contacto_general",
  resumen: "Resumen",
  notificado: false,
  estado: "nuevo",
  prioridad: "media",
  asignado_usuario_id: null,
  asignado_a: null,
  audio_url: null,
  notas: "Interna",
  progreso: 0,
  fecha_creacion: "2026-08-05T13:30:00Z",
  fecha_limite: null,
  fecha_resolucion: null,
};

test("crea un formulario determinista y tipado para altas manuales", () => {
  const now = new Date(2026, 7, 5, 9, 7);

  assert.deepEqual(createEmptyAdminTicketForm(now), {
    conversation_id: `manual_${now.getTime()}`,
    hora: "09:07",
    nombre: "",
    apellido: "",
    telefono: "",
    dni: "",
    empresa: "",
    email: "",
    motivo: "",
    resumen: "",
    notas: "",
    audio_url: "",
    estado: "nuevo",
    prioridad: "media",
  });
});

test("alta manual limpia requeridos y omite opcionales vacíos", () => {
  const form = createEmptyAdminTicketForm(new Date(0));
  form.conversation_id = "  manual-1  ";
  form.hora = " 10:30 ";
  form.nombre = " Ana ";
  form.apellido = " Pérez ";
  form.motivo = " Consulta ";
  form.telefono = "  ";
  form.email = " ana@example.com ";

  assert.deepEqual(buildAdminTicketInput(form), {
    conversation_id: "manual-1",
    hora: "10:30",
    nombre: "Ana",
    apellido: "Pérez",
    email: "ana@example.com",
    motivo: "Consulta",
    estado: "nuevo",
    prioridad: "media",
  });
});

test("edición administrativa envía solo diferencias y permite borrar datos", () => {
  const baseline = ticketToAdminTicketForm(ticket);
  const form = {
    ...baseline,
    telefono: "   ",
    prioridad: "urgente" as const,
    notas: "  Nota corregida  ",
  };

  assert.deepEqual(buildAdminTicketUpdate(baseline, form), {
    telefono: null,
    notas: "Nota corregida",
    prioridad: "urgente",
  });
});

test("conversation id y cambios SSE ajenos no contaminan el PATCH", () => {
  const baseline = ticketToAdminTicketForm(ticket);
  const form = {
    ...baseline,
    conversation_id: "valor-ignorado-en-edicion",
    email: "nuevo@example.com",
  };

  const refreshedBySse = ticketToAdminTicketForm({
    ...ticket,
    empresa: "Empresa remota",
  });
  assert.equal(refreshedBySse.empresa, "Empresa remota");
  assert.deepEqual(buildAdminTicketUpdate(baseline, form), {
    email: "nuevo@example.com",
  });
});

test("edición sin cambios produce un PATCH vacío", () => {
  const baseline = ticketToAdminTicketForm(ticket);
  assert.deepEqual(buildAdminTicketUpdate(baseline, { ...baseline }), {});
});

test("permite materializar como null un espacio legado que el usuario borró", () => {
  const baseline = ticketToAdminTicketForm({
    ...ticket,
    telefono: "   ",
  });

  assert.deepEqual(
    buildAdminTicketUpdate(baseline, { ...baseline, telefono: "" }),
    { telefono: null },
  );
});
