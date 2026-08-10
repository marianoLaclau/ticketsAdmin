import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTicketAuditNote,
  formatTicketAuditAuthor,
  getTicketAuditEditedFields,
} from "../src/lib/ticket-audit.ts";

const current = {
  estado: "nuevo",
  prioridad: "media",
  asignado_usuario_id: null,
  asignado_a: null,
};

describe("helpers de auditoría de tickets", () => {
  it("deriva el autor con nombre completo, apellido nulo o email de respaldo", () => {
    assert.equal(
      formatTicketAuditAuthor({
        nombre: "Ana",
        apellido: "Pérez",
        email: "ana@example.test",
      }),
      "Ana Pérez",
    );
    assert.equal(
      formatTicketAuditAuthor({
        nombre: "Ana",
        apellido: null,
        email: "ana@example.test",
      }),
      "Ana",
    );
    assert.equal(
      formatTicketAuditAuthor({
        nombre: "",
        apellido: null,
        email: "fallback@example.test",
      }),
      "fallback@example.test",
    );
  });

  it("excluye campos estructurados sin perder desconocidos ni orden", () => {
    assert.deepEqual(
      getTicketAuditEditedFields([
        "estado",
        "telefono",
        "motivo_categoria",
        "campo_historico",
        "prioridad",
        "nombre",
        "asignado_usuario_id",
        "asignado_a",
      ]),
      ["telefono", "campo_historico", "nombre"],
    );
  });

  it("construye la nota exacta con snapshots, labels y fallback de campo", () => {
    assert.equal(
      buildTicketAuditNote(
        current,
        {
          estado: "en_proceso",
          prioridad: "alta",
          asignado_usuario_id: 7,
          asignado_a: "Operadora Uno",
        },
        [
          "telefono",
          "estado",
          "campo_historico",
          "nombre",
          "prioridad",
          "motivo_categoria",
          "asignado_usuario_id",
          "asignado_a",
        ],
      ),
      "Ticket actualizado. Estado: nuevo → en_proceso. Prioridad: media → alta. Asignación: Sin asignar → Operadora Uno. Campos editados: teléfono, campo_historico, nombre.",
    );
  });

  it("mantiene la nota base cuando no existen detalles", () => {
    assert.equal(
      buildTicketAuditNote(current, current, []),
      "Ticket actualizado.",
    );
  });
});
