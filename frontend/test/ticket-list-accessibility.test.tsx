import assert from "node:assert/strict";
import test from "node:test";
import type { Ticket } from "@workspace/api-client-react";
import { cleanup, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "../src/components/ui/table.tsx";
import { Progress } from "../src/components/ui/progress.tsx";
import { TicketListFiltersPanel } from "../src/features/ticket-list/TicketListFiltersPanel.tsx";
import { TicketListTableRow } from "../src/features/ticket-list/TicketListTableRow.tsx";
import { assertNoAxeViolations } from "./axe.ts";

const emptyFilters = {
  search: "",
  estado: "_all",
  prioridad: "_all",
  motivoCategoria: "_all",
  vencidos: false,
  fechaDesde: "",
  fechaHasta: "",
  horaDesde: "",
  horaHasta: "",
  empresa: "",
};

const noOpFilterHandlers = {
  search: () => undefined,
  estado: () => undefined,
  prioridad: () => undefined,
  motivoCategoria: () => undefined,
  vencidos: () => undefined,
  fechaDesde: () => undefined,
  fechaHasta: () => undefined,
  horaDesde: () => undefined,
  horaHasta: () => undefined,
  empresa: () => undefined,
};

const ticket: Ticket = {
  id: 73,
  version: 1,
  conversation_id: "conversation-73",
  hora: "09:15",
  nombre: "María",
  apellido: "Gómez",
  telefono: null,
  dni: null,
  empresa: null,
  estado_empleado: null,
  email: null,
  motivo: "Consulta general",
  motivo_categoria: "contacto_general",
  resumen: "Consulta sin asignación",
  notificado: false,
  estado: "nuevo",
  prioridad: "media",
  asignado_usuario_id: null,
  asignado_a: null,
  audio_url: null,
  notas: null,
  fecha_creacion: "2026-08-09T12:15:00.000Z",
  fecha_limite: "2026-08-12T12:15:00.000Z",
  fecha_resolucion: null,
  progreso: 35,
};

test("Progress reenvía value y max y calcula la escala configurada", (t) => {
  t.after(cleanup);

  render(
    <main>
      <Progress value={25} max={50} aria-label="Avance de prueba" />
    </main>,
  );

  const progress = screen.getByRole("progressbar", {
    name: "Avance de prueba",
  });
  assert.equal(progress.getAttribute("aria-valuenow"), "25");
  assert.equal(progress.getAttribute("aria-valuemax"), "50");
  assert.equal(
    (progress.firstElementChild as HTMLElement | null)?.style.transform,
    "translateX(-50%)",
  );
});

test("los filtros conservan nombres y un foco visible para búsqueda, fechas y horas", async (t) => {
  t.after(cleanup);

  render(
    <main>
      <TicketListFiltersPanel
        values={emptyFilters}
        onChange={noOpFilterHandlers}
        isExporting={false}
        onExport={async () => undefined}
        onClear={() => undefined}
      />
    </main>,
  );

  for (const accessibleName of [
    "Buscar tickets",
    "Fecha desde",
    "Fecha hasta",
    "Hora desde",
    "Hora hasta",
  ]) {
    const control = screen.getByLabelText(accessibleName);
    control.focus();
    assert.equal(document.activeElement, control);
    assert.match(control.className, /focus-visible:ring-2/);
    assert.doesNotMatch(control.className, /focus-visible:ring-0/);
  }

  await assertNoAxeViolations();
});

test("cada fila nombra y expone el progreso, y mantiene legible el estado sin asignar", async (t) => {
  t.after(cleanup);
  const location = memoryLocation({ path: "/tickets" });
  const headers = [
    "Fecha",
    "Contacto",
    "Categoría",
    "Motivo",
    "Estado",
    "Prioridad",
    "Asignado",
    "Progreso",
    "Límite",
  ];

  render(
    <main>
      <Router hook={location.hook}>
        <Table>
          <TableCaption className="sr-only">Tickets de prueba</TableCaption>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TicketListTableRow
              ticket={ticket}
              navigationState={{
                source: "ticket-list",
                returnTo: "/tickets",
              }}
              onOpen={() => undefined}
            />
          </TableBody>
        </Table>
      </Router>
    </main>,
  );

  const progress = screen.getByRole("progressbar", {
    name: "Progreso del ticket #73",
  });
  assert.equal(progress.getAttribute("aria-valuenow"), "35");
  assert.equal(progress.getAttribute("aria-valuemin"), "0");
  assert.equal(progress.getAttribute("aria-valuemax"), "100");

  const unassigned = screen.getByText("Sin asignar");
  assert.ok(unassigned.classList.contains("text-slate-600"));
  assert.equal(unassigned.classList.contains("text-slate-400"), false);

  await assertNoAxeViolations();
});
