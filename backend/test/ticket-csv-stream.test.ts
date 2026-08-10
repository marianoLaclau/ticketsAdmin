import assert from "node:assert/strict";
import { setImmediate as waitImmediate } from "node:timers/promises";
import { describe, it } from "node:test";
import { Writable } from "node:stream";
import {
  serializeTicketsCsv,
  type TicketCsvRecord,
} from "../src/lib/ticket-csv.ts";
import {
  createTicketCsvExportDeadline,
  isTicketCsvClientDisconnect,
  pipeTicketCsvStream,
  prepareTicketCsvStream,
  readTicketCsvExportTimeoutMs,
  TICKET_CSV_EXPORT_TIMEOUT_DEFAULT_MS,
  TICKET_CSV_EXPORT_TIMEOUT_ENV,
  TICKET_CSV_EXPORT_TIMEOUT_MIN_MS,
  TicketCsvExportDeadlineError,
} from "../src/lib/ticket-csv-stream.ts";

type DatabaseTicket = Omit<TicketCsvRecord, "notificado"> & {
  notificado: number;
};

function createTicket(id: number): DatabaseTicket {
  return {
    id,
    conversation_id: `conv-${id}`,
    hora: "12:30",
    nombre: id === 2 ? "=2+2" : `Persona ${id}`,
    apellido: "Prueba",
    telefono: "+54 11 1234-5678",
    dni: `1000000${id}`,
    empresa: "ACME; Sur",
    estado_empleado: "Activo",
    email: `persona${id}@example.test`,
    motivo: 'Consulta por "recibo"',
    motivo_categoria: "recibos_documentacion",
    resumen: "Linea uno\nLinea dos",
    notificado: id % 2,
    estado: "pendiente",
    prioridad: "urgente",
    asignado_a: "Operadora Uno",
    audio_url: "https://example.test/audio.mp3",
    notas: '=HYPERLINK("https://example.test")',
    progreso: 50,
    fecha_creacion: 1_785_405_000_000 + id,
    fecha_limite: null,
    fecha_resolucion: null,
  };
}

function expectedTicket(ticket: DatabaseTicket): TicketCsvRecord {
  return { ...ticket, notificado: Boolean(ticket.notificado) };
}

function createTrackedDatabase(
  records: DatabaseTicket[],
  readError?: Error,
  readErrorAtCall = 1,
) {
  let index = 0;
  const tracker = {
    preparedSql: "",
    boundParams: [] as unknown[],
    iterateCalls: 0,
    nextCalls: 0,
    returnCalls: 0,
    allCalls: 0,
  };
  const iterator: IterableIterator<DatabaseTicket> = {
    next() {
      tracker.nextCalls++;
      if (readError && tracker.nextCalls === readErrorAtCall) throw readError;
      const value = records[index++];
      return value === undefined
        ? { done: true, value: undefined }
        : { done: false, value };
    },
    return() {
      tracker.returnCalls++;
      return { done: true, value: undefined };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
  const database = {
    prepare(sql: string) {
      tracker.preparedSql = sql;
      return {
        iterate(...params: unknown[]) {
          tracker.iterateCalls++;
          tracker.boundParams = params;
          return iterator;
        },
        all() {
          tracker.allCalls++;
          throw new Error("La exportacion no debe usar all()");
        },
      };
    },
  } as unknown as Parameters<typeof prepareTicketCsvStream>[0];

  return { database, tracker };
}

class GateWritable extends Writable {
  readonly chunks: Buffer[] = [];
  private readonly callbacks: Array<(error?: Error | null) => void> = [];
  private readonly observers: Array<{ count: number; resolve: () => void }> =
    [];

  constructor() {
    super({ highWaterMark: 1 });
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.from(chunk));
    this.callbacks.push(callback);
    for (const observer of [...this.observers]) {
      if (this.chunks.length >= observer.count) observer.resolve();
    }
  }

  waitForChunkCount(count: number): Promise<void> {
    if (this.chunks.length >= count) return Promise.resolve();
    return new Promise((resolve) => {
      const observer = {
        count,
        resolve: () => {
          const index = this.observers.indexOf(observer);
          if (index >= 0) this.observers.splice(index, 1);
          resolve();
        },
      };
      this.observers.push(observer);
    });
  }

  releaseNext(): void {
    const callback = this.callbacks.shift();
    assert.ok(callback, "debe haber una escritura bloqueada");
    callback();
  }
}

describe("streaming CSV de tickets", () => {
  it("valida el deadline configurado y usa cinco minutos por defecto", () => {
    assert.equal(
      readTicketCsvExportTimeoutMs({}),
      TICKET_CSV_EXPORT_TIMEOUT_DEFAULT_MS,
    );
    assert.equal(
      readTicketCsvExportTimeoutMs({
        [TICKET_CSV_EXPORT_TIMEOUT_ENV]: "45000",
      }),
      45_000,
    );

    for (const value of [
      "",
      "0",
      "999",
      "-1",
      "1.5",
      " 1000",
      "1000 ",
      "1e3",
      "2147483648",
    ]) {
      assert.throws(
        () =>
          readTicketCsvExportTimeoutMs({
            [TICKET_CSV_EXPORT_TIMEOUT_ENV]: value,
          }),
        RangeError,
      );
    }
    assert.throws(
      () =>
        createTicketCsvExportDeadline({
          timeoutMs: TICKET_CSV_EXPORT_TIMEOUT_MIN_MS - 1,
        }),
      RangeError,
    );
  });

  it("permite reintentar la limpieza si el clear del deadline falla", () => {
    const clearError = new Error("fallo al limpiar timer");
    let clearCalls = 0;
    const deadline = createTicketCsvExportDeadline({
      timeoutMs: TICKET_CSV_EXPORT_TIMEOUT_MIN_MS,
      scheduleTimeout() {
        return {};
      },
      clearScheduledTimeout() {
        clearCalls++;
        if (clearCalls === 1) throw clearError;
      },
    });

    assert.throws(
      () => deadline.dispose(),
      (error) => error === clearError,
    );
    deadline.dispose();
    deadline.dispose();
    assert.equal(clearCalls, 2);
  });

  it("produce varios chunks con paridad byte a byte y nunca usa all()", () => {
    const records = [createTicket(1), createTicket(2), createTicket(3)];
    const { database, tracker } = createTrackedDatabase(records);
    const prepared = prepareTicketCsvStream(database, {
      sql: "SELECT * FROM tickets WHERE prioridad = ? ORDER BY id",
      params: ["urgente"],
    });

    assert.equal(tracker.nextCalls, 1, "solo anticipa la primera fila");
    const chunks = [...prepared.chunks];
    assert.equal(chunks.length, records.length + 1);
    assert.deepEqual(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk, "utf8"))),
      Buffer.from(serializeTicketsCsv(records.map(expectedTicket)), "utf8"),
    );
    assert.equal(
      tracker.preparedSql,
      "SELECT * FROM tickets WHERE prioridad = ? ORDER BY id",
    );
    assert.deepEqual(tracker.boundParams, ["urgente"]);
    assert.equal(tracker.iterateCalls, 1);
    assert.equal(tracker.allCalls, 0);
    assert.equal(tracker.returnCalls, 1);
  });

  it("respeta backpressure sin avanzar el cursor completo", async () => {
    const records = [createTicket(1), createTicket(2), createTicket(3)];
    const { database, tracker } = createTrackedDatabase(records);
    const prepared = prepareTicketCsvStream(database, {
      sql: "SELECT * FROM tickets",
      params: [],
    });
    const destination = new GateWritable();
    const piping = pipeTicketCsvStream(prepared, destination);

    await destination.waitForChunkCount(1);
    await waitImmediate();
    assert.equal(
      tracker.nextCalls,
      1,
      "el header bloqueado no consume mas filas",
    );

    for (let count = 2; count <= records.length + 1; count++) {
      destination.releaseNext();
      await destination.waitForChunkCount(count);
    }
    destination.releaseNext();
    await piping;

    assert.equal(tracker.returnCalls, 1);
    assert.deepEqual(
      Buffer.concat(destination.chunks),
      Buffer.from(serializeTicketsCsv(records.map(expectedTicket)), "utf8"),
    );
  });

  it("abortar el destino libera inmediatamente el iterador", async () => {
    const { database, tracker } = createTrackedDatabase([
      createTicket(1),
      createTicket(2),
    ]);
    const prepared = prepareTicketCsvStream(database, {
      sql: "SELECT * FROM tickets",
      params: [],
    });
    const destination = new GateWritable();
    const piping = pipeTicketCsvStream(prepared, destination);

    await destination.waitForChunkCount(1);
    const disconnect = Object.assign(new Error("cliente desconectado"), {
      code: "ECONNRESET",
    });
    destination.destroy(disconnect);

    await assert.rejects(piping, (error) => error === disconnect);
    assert.equal(tracker.returnCalls, 1);
    assert.equal(isTicketCsvClientDisconnect(disconnect), true);
  });

  it("el deadline aborta el pipeline y libera timer y cursor sin esperas", async () => {
    const { database, tracker } = createTrackedDatabase([
      createTicket(1),
      createTicket(2),
    ]);
    const prepared = prepareTicketCsvStream(database, {
      sql: "SELECT * FROM tickets",
      params: [],
    });
    const destination = new GateWritable();
    let fireDeadline: (() => void) | undefined;
    let scheduledMs = 0;
    let unrefCalls = 0;
    let clearCalls = 0;
    const timer = {
      unref() {
        unrefCalls++;
      },
    };
    const deadline = createTicketCsvExportDeadline({
      timeoutMs: TICKET_CSV_EXPORT_TIMEOUT_MIN_MS,
      scheduleTimeout(callback, timeoutMs) {
        fireDeadline = callback;
        scheduledMs = timeoutMs;
        return timer;
      },
      clearScheduledTimeout(value) {
        assert.equal(value, timer);
        clearCalls++;
      },
    });
    const piping = pipeTicketCsvStream(prepared, destination, {
      signal: deadline.signal,
    });

    await destination.waitForChunkCount(1);
    assert.equal(scheduledMs, TICKET_CSV_EXPORT_TIMEOUT_MIN_MS);
    assert.equal(unrefCalls, 1);
    assert.ok(fireDeadline);
    fireDeadline();

    await assert.rejects(
      piping,
      (error) =>
        error instanceof Error &&
        error.name === "AbortError" &&
        (error as NodeJS.ErrnoException).code === "ABORT_ERR",
    );
    assert.ok(deadline.signal.reason instanceof TicketCsvExportDeadlineError);
    assert.equal(tracker.returnCalls, 1);

    deadline.dispose();
    deadline.dispose();
    assert.equal(clearCalls, 1);
  });

  it("un error de lectura inicial ocurre en preflight y cierra el cursor", () => {
    const readError = new Error("fallo de lectura");
    const { database, tracker } = createTrackedDatabase([], readError);

    assert.throws(
      () =>
        prepareTicketCsvStream(database, {
          sql: "SELECT * FROM tickets",
          params: [],
        }),
      (error) => error === readError,
    );
    assert.equal(tracker.returnCalls, 1);
    assert.equal(tracker.allCalls, 0);
  });

  it("un error tardio rechaza el pipeline y tambien libera el cursor", async () => {
    const readError = new Error("fallo tardio de lectura");
    const { database, tracker } = createTrackedDatabase(
      [createTicket(1), createTicket(2)],
      readError,
      3,
    );
    const prepared = prepareTicketCsvStream(database, {
      sql: "SELECT * FROM tickets",
      params: [],
    });
    const destination = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    await assert.rejects(
      pipeTicketCsvStream(prepared, destination),
      (error) => error === readError,
    );
    assert.equal(tracker.nextCalls, 3);
    assert.equal(tracker.returnCalls, 1);
  });
});
