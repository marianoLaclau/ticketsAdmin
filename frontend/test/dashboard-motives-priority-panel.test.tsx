import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import { MOTIVO_CATEGORIA_CODIGOS } from "@workspace/ingesta";
import { DashboardMotivesPriorityPanel } from "../src/features/dashboard/DashboardMotivesPriorityPanel.tsx";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

// El catálogo completo: es el caso que estiraba el panel. Al pasar de diez a
// catorce categorías, la lista de motivos crecía sin tope y arrastraba la
// altura del contenedor, dejando el gráfico de prioridad sobre un bloque de
// espacio en blanco.
const motives = MOTIVO_CATEGORIA_CODIGOS.map((categoria, index) => ({
  categoria,
  cantidad: 40 - index * 2,
})) as never;

const priorities = [
  { prioridad: "urgente", cantidad: 4 },
  { prioridad: "alta", cantidad: 9 },
  { prioridad: "media", cantidad: 22 },
  { prioridad: "baja", cantidad: 7 },
] as never;

function renderPanel() {
  return render(
    <DashboardMotivesPriorityPanel
      motives={motives}
      priorities={priorities}
      isMotivesLoading={false}
      isPrioritiesLoading={false}
    />,
  );
}

test("acota el ranking de motivos sin ocultar categorías", (t) => {
  t.after(cleanup);
  const { container } = renderPanel();

  const lista = container.querySelector(".scroll-sutil");
  assert.ok(lista, "el ranking de motivos debe ser el área con scroll");

  // El tope existe solo en dos columnas: en una sola no hay nada al lado que
  // pueda quedar desalineado, así que la lista se muestra completa.
  assert.match(lista.className, /lg:max-h-\[212px\]/);
  assert.match(lista.className, /lg:overflow-y-auto/);
  assert.doesNotMatch(lista.className, /(^|\s)max-h-/);

  // El scroll acota el alto, no los datos: las catorce siguen presentes.
  assert.equal(lista.children.length, MOTIVO_CATEGORIA_CODIGOS.length);
});

test("conserva el gráfico de prioridad y su leyenda", (t) => {
  t.after(cleanup);
  renderPanel();

  assert.ok(screen.getByText("Tickets por Prioridad"));
  for (const etiqueta of ["Urgente", "Alta", "Media", "Baja"]) {
    assert.ok(
      screen.getAllByText(etiqueta).length > 0,
      `falta ${etiqueta} en la leyenda`,
    );
  }
});
