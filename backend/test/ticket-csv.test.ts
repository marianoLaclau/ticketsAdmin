import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTicketCsvFilename,
  escapeTicketCsvCell,
  formatTicketCsvDateTime,
  serializeTicketsCsv,
  TICKET_CSV_BOM,
  TICKET_CSV_DELIMITER,
  TICKET_CSV_HEADERS,
  type TicketCsvRecord,
} from "../src/lib/ticket-csv.ts";

const ticket: TicketCsvRecord = {
  id: 7,
  conversation_id: "conv-7",
  hora: "12:30",
  nombre: "Ana",
  apellido: "Perez",
  telefono: "+54 11 1234-5678",
  dni: "00123456",
  empresa: "ACME; Sur",
  email: "ana@example.test",
  motivo: 'Consulta por "recibo"',
  motivo_categoria: "recibos_documentacion",
  resumen: "Linea uno\nLinea dos",
  notificado: true,
  estado: "pendiente",
  prioridad: "urgente",
  asignado_a: "Operadora Uno",
  audio_url: "https://example.test/audio.mp3",
  notas: '=HYPERLINK("https://example.test")',
  progreso: 50,
  fecha_creacion: new Date("2026-07-22T15:30:00.000Z"),
  fecha_limite: new Date("2026-07-24T15:30:00.000Z"),
  fecha_resolucion: null,
};

describe("CSV de tickets", () => {
  it("usa UTF-8 BOM, punto y coma y una fila completa", () => {
    const csv = serializeTicketsCsv([ticket]);

    assert.ok(csv.startsWith(TICKET_CSV_BOM));
    const [header, row] = csv.slice(1).split("\r\n");
    assert.equal(
      header.split(TICKET_CSV_DELIMITER).length,
      TICKET_CSV_HEADERS.length,
    );
    assert.ok(row);
    assert.match(row, /"Recibos y documentaci/);
    assert.match(row, /"Pendiente \(fue contactado\)"/);
  });

  it("escapa comillas, delimitadores y saltos sin perder contenido", () => {
    const csv = serializeTicketsCsv([ticket], { includeBom: false });

    assert.match(csv, /"ACME; Sur"/);
    assert.match(csv, /"Consulta por ""recibo"""/);
    assert.match(csv, /"Linea uno\nLinea dos"/);
  });

  it("neutraliza formulas y conserva telefonos internacionales como texto", () => {
    assert.equal(escapeTicketCsvCell("=2+2"), '"\'=2+2"');
    assert.equal(escapeTicketCsvCell("  @SUM(A1)"), '"\'  @SUM(A1)"');
    assert.equal(escapeTicketCsvCell("+54111234"), '"\'+54111234"');
    assert.equal(escapeTicketCsvCell(42), '"42"');

    const csv = serializeTicketsCsv([ticket], { includeBom: false });
    assert.match(csv, /"'\+54 11 1234-5678"/);
    assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  });

  it("formatea fechas en la zona de negocio y deja nulos vacios", () => {
    assert.equal(
      formatTicketCsvDateTime("2026-07-22T15:30:00.000Z"),
      "22/07/2026 12:30:00",
    );
    assert.equal(formatTicketCsvDateTime(null), "");
    assert.equal(formatTicketCsvDateTime("invalida"), "");
    assert.equal(
      createTicketCsvFilename(new Date("2026-07-23T01:00:00.000Z")),
      "tickets-2026-07-22.csv",
    );
  });
});
