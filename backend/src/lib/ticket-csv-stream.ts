import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  serializeTicketCsvHeader,
  serializeTicketCsvRow,
  TICKET_CSV_LINE_ENDING,
  type TicketCsvOptions,
  type TicketCsvRecord,
} from "./ticket-csv";

type DatabaseTicketCsvRecord = Omit<TicketCsvRecord, "notificado"> & {
  notificado: boolean | number;
};

interface TicketCsvDatabase {
  prepare(source: string): {
    iterate(...params: unknown[]): IterableIterator<unknown>;
  };
}

interface TicketCsvDeadlineTimer {
  unref?(): unknown;
}

export const TICKET_CSV_EXPORT_TIMEOUT_ENV = "TICKET_CSV_EXPORT_TIMEOUT_MS";
export const TICKET_CSV_EXPORT_TIMEOUT_DEFAULT_MS = 5 * 60_000;
export const TICKET_CSV_EXPORT_TIMEOUT_MIN_MS = 1_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export class TicketCsvExportDeadlineError extends Error {
  readonly code = "TICKET_CSV_EXPORT_DEADLINE";

  constructor(readonly timeoutMs: number) {
    super(`La exportacion CSV excedio su limite de ${timeoutMs} ms`);
    this.name = "TicketCsvExportDeadlineError";
  }
}

export interface TicketCsvExportDeadline {
  readonly signal: AbortSignal;
  dispose(): void;
}

interface TicketCsvExportDeadlineOptions {
  timeoutMs: number;
  scheduleTimeout?: (
    callback: () => void,
    timeoutMs: number,
  ) => TicketCsvDeadlineTimer;
  clearScheduledTimeout?: (timer: TicketCsvDeadlineTimer) => void;
}

interface PipeTicketCsvStreamOptions {
  signal?: AbortSignal;
}

export interface TicketCsvSqlQuery {
  sql: string;
  params: unknown[];
}

export interface PreparedTicketCsvStream {
  readonly chunks: Iterable<string>;
  close(): void;
}

function invalidTimeoutError(): RangeError {
  return new RangeError(
    `${TICKET_CSV_EXPORT_TIMEOUT_ENV} debe ser un entero entre ${TICKET_CSV_EXPORT_TIMEOUT_MIN_MS} y ${MAX_TIMEOUT_MS}`,
  );
}

function validateTimeoutMs(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < TICKET_CSV_EXPORT_TIMEOUT_MIN_MS ||
    value > MAX_TIMEOUT_MS
  ) {
    throw invalidTimeoutError();
  }
  return value;
}

export function readTicketCsvExportTimeoutMs(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = environment[TICKET_CSV_EXPORT_TIMEOUT_ENV];
  if (raw === undefined) return TICKET_CSV_EXPORT_TIMEOUT_DEFAULT_MS;
  if (!/^[1-9]\d*$/.test(raw)) throw invalidTimeoutError();
  return validateTimeoutMs(Number(raw));
}

const scheduleTimeoutDefault = (
  callback: () => void,
  timeoutMs: number,
): TicketCsvDeadlineTimer => setTimeout(callback, timeoutMs);

const clearScheduledTimeoutDefault = (timer: TicketCsvDeadlineTimer): void => {
  clearTimeout(timer as NodeJS.Timeout);
};

/** Crea un deadline absoluto; no se renueva al avanzar la descarga. */
export function createTicketCsvExportDeadline(
  options: TicketCsvExportDeadlineOptions,
): TicketCsvExportDeadline {
  const timeoutMs = validateTimeoutMs(options.timeoutMs);
  const scheduleTimeout = options.scheduleTimeout ?? scheduleTimeoutDefault;
  const clearScheduledTimeout =
    options.clearScheduledTimeout ?? clearScheduledTimeoutDefault;
  const controller = new AbortController();
  let disposed = false;
  const timer = scheduleTimeout(() => {
    if (disposed) return;
    controller.abort(new TicketCsvExportDeadlineError(timeoutMs));
  }, timeoutMs);

  try {
    timer.unref?.();
  } catch (error) {
    clearScheduledTimeout(timer);
    throw error;
  }

  return {
    signal: controller.signal,
    dispose() {
      if (disposed) return;
      clearScheduledTimeout(timer);
      disposed = true;
    },
  };
}

function normalizeDatabaseRecord(value: unknown): TicketCsvRecord {
  const ticket = value as DatabaseTicketCsvRecord;
  return {
    ...ticket,
    notificado: Boolean(ticket.notificado),
  };
}

function closeIterator(iterator: IterableIterator<unknown>): void {
  iterator.return?.();
}

/**
 * Abre el statement y consume una sola fila antes de devolver el stream. Esto
 * hace fallar la preparacion/ejecucion inicial antes de que la ruta envie sus
 * headers, sin materializar el conjunto completo.
 */
export function prepareTicketCsvStream(
  database: TicketCsvDatabase,
  query: TicketCsvSqlQuery,
  options: TicketCsvOptions = {},
): PreparedTicketCsvStream {
  const headerChunk = serializeTicketCsvHeader(options);
  const statement = database.prepare(query.sql);
  const rows = statement.iterate(...query.params);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    closeIterator(rows);
  };

  try {
    const first = rows.next();
    const firstRowChunk = first.done
      ? null
      : `${TICKET_CSV_LINE_ENDING}${serializeTicketCsvRow(
          normalizeDatabaseRecord(first.value),
          options,
        )}`;

    function* chunks(): Generator<string> {
      try {
        yield headerChunk;
        if (firstRowChunk !== null) yield firstRowChunk;

        while (true) {
          const next = rows.next();
          if (next.done) return;
          yield `${TICKET_CSV_LINE_ENDING}${serializeTicketCsvRow(
            normalizeDatabaseRecord(next.value),
            options,
          )}`;
        }
      } finally {
        close();
      }
    }

    return { chunks: chunks(), close };
  } catch (error) {
    close();
    throw error;
  }
}

/** Node pipeline regula backpressure y destruye ambos extremos ante abortos. */
export async function pipeTicketCsvStream(
  prepared: PreparedTicketCsvStream,
  destination: Writable,
  options: PipeTicketCsvStreamOptions = {},
): Promise<void> {
  const source = Readable.from(prepared.chunks, {
    objectMode: false,
    // La fuente anticipa como maximo un fragmento fuera de la capacidad
    // acotada del destino; el cursor nunca acumula el resultado completo.
    highWaterMark: 1,
  });

  try {
    if (options.signal) {
      await pipeline(source, destination, { signal: options.signal });
    } else {
      await pipeline(source, destination);
    }
  } finally {
    prepared.close();
  }
}

export function isTicketCsvClientDisconnect(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String(error.code);
  return ["ECONNRESET", "EPIPE", "ERR_STREAM_PREMATURE_CLOSE"].includes(code);
}
