import assert from "node:assert/strict";
import test from "node:test";
import type { ActividadItem } from "@workspace/api-client-react";
import { cleanup, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DashboardRecentActivityPanel } from "../src/features/dashboard/DashboardRecentActivityPanel.tsx";

function createActivity(index: number): ActividadItem {
  return {
    tipo: index % 2 === 0 ? "ticket_creado" : "seguimiento",
    ticket_id: 100 + index,
    nombre_contacto: `Contacto ${index}`,
    descripcion: `Movimiento numero ${index}`,
    fecha: "2026-08-12T12:00:00.000Z",
  } as ActividadItem;
}

function renderPanel(cantidad: number) {
  const location = memoryLocation({ path: "/" });
  return render(
    <Router hook={location.hook}>
      <DashboardRecentActivityPanel
        activities={Array.from({ length: cantidad }, (_, i) =>
          createActivity(i),
        )}
        isLoading={false}
        title="Actividad Reciente"
      />
    </Router>,
  );
}

test("se estira a toda la altura disponible de la grilla", (t) => {
  cleanup();
  t.after(cleanup);

  const { container } = renderPanel(4);

  const columna = container.firstElementChild as HTMLElement;
  assert.doesNotMatch(columna.className, /lg:self-start/);

  const tarjeta = columna.firstElementChild as HTMLElement;
  assert.match(tarjeta.className, /h-full/);
  assert.match(tarjeta.className, /min-h-0/);
});

test("usa el alto disponible y desplaza internamente la actividad larga", (t) => {
  cleanup();
  t.after(cleanup);

  const { container } = renderPanel(20);

  const lista = container.querySelector(".scroll-sutil") as HTMLElement;
  assert.ok(lista, "la lista debe tener el área desplazable");
  assert.match(lista.className, /flex-1/);
  assert.match(lista.className, /min-h-0/);
  assert.match(lista.className, /overflow-y-auto/);

  // El scroll interno no recorta datos del historial.
  assert.ok(screen.getByText("Movimiento numero 0"));
  assert.ok(screen.getByText("Movimiento numero 19"));
});
