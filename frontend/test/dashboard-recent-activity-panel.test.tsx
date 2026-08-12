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

test("no se estira para igualar la columna izquierda", (t) => {
  cleanup();
  t.after(cleanup);

  // Con `h-full` la tarjeta crecía hasta la altura de la columna de tickets
  // vencidos y quedaba con un bloque de blanco adentro. Debe tomar su alto
  // natural y dejar que la grilla no la estire.
  const { container } = renderPanel(4);

  const columna = container.firstElementChild as HTMLElement;
  assert.match(columna.className, /lg:self-start/);

  const tarjeta = columna.firstElementChild as HTMLElement;
  assert.doesNotMatch(tarjeta.className, /h-full/);
});

test("acota la lista larga y la desplaza dentro del panel", (t) => {
  cleanup();
  t.after(cleanup);

  const { container } = renderPanel(20);

  const lista = container.querySelector(".scroll-sutil") as HTMLElement;
  assert.ok(lista, "la lista debe tener el área desplazable");
  assert.equal(lista.style.maxHeight, "640px");
  assert.match(lista.className, /overflow-y-auto/);

  // El tope acota el alto, no los datos.
  assert.ok(screen.getByText("Movimiento numero 0"));
  assert.ok(screen.getByText("Movimiento numero 19"));
});
