import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVersionedTicketUpdate,
  createTicketEditBaseline,
  shouldApplyTicketRevision,
} from "../src/lib/ticket-version.ts";

test("congela la versión junto con los valores al abrir el editor", () => {
  const liveTicket = { version: 4 };
  const source = { nombre: "Ana" };
  const baseline = createTicketEditBaseline(liveTicket, source);

  liveTicket.version = 5;
  source.nombre = "Cambio remoto";

  assert.deepEqual(baseline, {
    expectedVersion: 4,
    values: { nombre: "Ana" },
  });
  assert.deepEqual(
    buildVersionedTicketUpdate(
      { nombre: "Cambio local" },
      baseline.expectedVersion,
    ),
    { nombre: "Cambio local", expected_version: 4 },
  );
});

test("un change-set vacío sigue siendo un no-op aunque exista versión", () => {
  assert.equal(buildVersionedTicketUpdate({}, 3), null);
});

test("rechaza una versión local imposible antes de llamar a la API", () => {
  for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => buildVersionedTicketUpdate({ nombre: "Ana" }, version),
      RangeError,
    );
  }
});

test("la caché nunca reemplaza una revisión más nueva", () => {
  assert.equal(shouldApplyTicketRevision(undefined, { version: 4 }), true);
  assert.equal(shouldApplyTicketRevision({ version: 4 }, { version: 4 }), true);
  assert.equal(shouldApplyTicketRevision({ version: 4 }, { version: 5 }), true);
  assert.equal(
    shouldApplyTicketRevision({ version: 5 }, { version: 4 }),
    false,
  );
});
