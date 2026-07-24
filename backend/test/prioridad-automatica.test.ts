import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sumarHorasHabiles } from "@workspace/ingesta";
import {
  crearServicioPrioridadAutomatica,
  ejecutarCicloPrioridadAutomatica,
  type CambioPrioridadCondicional,
  type RepositorioPrioridadAutomatica,
  type TicketCandidatoPrioridad,
} from "../src/lib/prioridad-automatica.ts";

function ahoraLaborable(): Date {
  // Miercoles 22/07/2026 a las 10:00 de Buenos Aires.
  return new Date("2026-07-22T13:00:00.000Z");
}

function ticket(
  id: number,
  horasRestantes: number,
  overrides: Partial<TicketCandidatoPrioridad> = {},
): TicketCandidatoPrioridad {
  const ahora = ahoraLaborable();
  return {
    id,
    estado: "nuevo",
    prioridad: "media",
    fechaLimite: sumarHorasHabiles(ahora, horasRestantes),
    visible: true,
    ...overrides,
  };
}

class RepositorioEnMemoria implements RepositorioPrioridadAutomatica {
  readonly tickets: TicketCandidatoPrioridad[];
  readonly cambios: CambioPrioridadCondicional[] = [];
  lecturas = 0;

  constructor(tickets: TicketCandidatoPrioridad[]) {
    this.tickets = tickets;
  }

  async listarCandidatos(): Promise<readonly TicketCandidatoPrioridad[]> {
    this.lecturas += 1;
    return this.tickets;
  }

  async promoverSiCoincide(cambio: CambioPrioridadCondicional): Promise<boolean> {
    const actual = this.tickets.find((item) => item.id === cambio.ticketId);
    if (
      !actual ||
      !actual.visible ||
      actual.estado === "resuelto" ||
      actual.estado === "cerrado" ||
      actual.prioridad !== cambio.prioridadEsperada ||
      actual.fechaLimite?.getTime() !== cambio.fechaLimiteEsperada.getTime()
    ) {
      return false;
    }

    actual.prioridad = cambio.prioridadNueva;
    this.cambios.push(cambio);
    return true;
  }
}

describe("ciclo de prioridad automatica", () => {
  it("promueve por umbral y omite tickets ocultos, finalizados o sin vencimiento", async () => {
    const repositorio = new RepositorioEnMemoria([
      ticket(1, 25),
      ticket(2, 24),
      ticket(3, 12),
      ticket(4, 5, { visible: false }),
      ticket(5, 5, { estado: "resuelto" }),
      ticket(6, 5, { estado: "cerrado" }),
      ticket(7, 5, { fechaLimite: null }),
      ticket(8, 5, { fechaLimite: new Date(Number.NaN) }),
    ]);

    const resultado = await ejecutarCicloPrioridadAutomatica(
      repositorio,
      ahoraLaborable(),
    );

    assert.equal(resultado.revisados, 8);
    assert.equal(resultado.evaluados, 3);
    assert.deepEqual(
      resultado.promociones.map(({ ticketId, prioridadNueva }) => ({
        ticketId,
        prioridadNueva,
      })),
      [
        { ticketId: 2, prioridadNueva: "alta" },
        { ticketId: 3, prioridadNueva: "urgente" },
      ],
    );
    assert.equal(repositorio.cambios.length, 2);
  });

  it("es monotono e idempotente al repetir el mismo ciclo", async () => {
    const repositorio = new RepositorioEnMemoria([
      ticket(1, 10, { prioridad: "media" }),
      ticket(2, 30, { prioridad: "alta" }),
      ticket(3, 20, { prioridad: "urgente" }),
    ]);

    const primero = await ejecutarCicloPrioridadAutomatica(
      repositorio,
      ahoraLaborable(),
    );
    const segundo = await ejecutarCicloPrioridadAutomatica(
      repositorio,
      ahoraLaborable(),
    );

    assert.deepEqual(
      repositorio.tickets.map(({ id, prioridad }) => ({ id, prioridad })),
      [
        { id: 1, prioridad: "urgente" },
        { id: 2, prioridad: "alta" },
        { id: 3, prioridad: "urgente" },
      ],
    );
    assert.equal(primero.promociones.length, 1);
    assert.equal(segundo.promociones.length, 0);
    assert.equal(repositorio.cambios.length, 1);
  });

  it("no informa una promocion si falla el compare-and-set", async () => {
    const base = new RepositorioEnMemoria([ticket(1, 5)]);
    const repositorio: RepositorioPrioridadAutomatica = {
      listarCandidatos: () => base.listarCandidatos(),
      promoverSiCoincide: async () => false,
    };

    const resultado = await ejecutarCicloPrioridadAutomatica(
      repositorio,
      ahoraLaborable(),
    );

    assert.equal(resultado.evaluados, 1);
    assert.equal(resultado.promociones.length, 0);
    assert.equal(base.tickets[0]?.prioridad, "media");
  });

  it("rechaza un instante de evaluacion invalido antes de leer", async () => {
    const repositorio = new RepositorioEnMemoria([]);

    await assert.rejects(
      ejecutarCicloPrioridadAutomatica(
        repositorio,
        new Date(Number.NaN),
      ),
      RangeError,
    );
    assert.equal(repositorio.lecturas, 0);
  });
});

describe("servicio de prioridad automatica", () => {
  it("coalesce ejecuciones concurrentes y no permite solapamiento", async () => {
    let liberarLectura: ((tickets: readonly TicketCandidatoPrioridad[]) => void) | undefined;
    let lecturas = 0;
    const repositorio: RepositorioPrioridadAutomatica = {
      listarCandidatos: () => {
        lecturas += 1;
        return new Promise((resolve) => {
          liberarLectura = resolve;
        });
      },
      promoverSiCoincide: async () => true,
    };
    let lecturasReloj = 0;
    const servicio = crearServicioPrioridadAutomatica(repositorio, () => {
      lecturasReloj += 1;
      return ahoraLaborable();
    });

    const primera = servicio.ejecutar();
    const segunda = servicio.ejecutar();

    assert.strictEqual(segunda, primera);
    assert.equal(servicio.estaEjecutando(), true);
    assert.equal(lecturas, 1);
    assert.equal(lecturasReloj, 1);

    liberarLectura?.([]);
    await primera;
    assert.equal(servicio.estaEjecutando(), false);

    const tercera = servicio.ejecutar();
    assert.notStrictEqual(tercera, primera);
    liberarLectura?.([]);
    await tercera;
    assert.equal(lecturas, 2);
    assert.equal(lecturasReloj, 2);
  });

  it("libera el lock tambien cuando una ejecucion falla", async () => {
    let intento = 0;
    const repositorio: RepositorioPrioridadAutomatica = {
      listarCandidatos: async () => {
        intento += 1;
        if (intento === 1) throw new Error("fallo esperado");
        return [];
      },
      promoverSiCoincide: async () => true,
    };
    const servicio = crearServicioPrioridadAutomatica(repositorio);

    await assert.rejects(servicio.ejecutar(ahoraLaborable()), /fallo esperado/);
    assert.equal(servicio.estaEjecutando(), false);

    const resultado = await servicio.ejecutar(ahoraLaborable());
    assert.equal(resultado.revisados, 0);
    assert.equal(intento, 2);
  });
});
