import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { readFileSync } from "node:fs";
import { request, type Server } from "node:http";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import { addEventClient, beginEventClientShutdown } from "../src/lib/events.ts";
import {
  APAGADO_TIMEOUT_PREDETERMINADO_MS,
  crearApagadoControlado,
  registrarCierreAntesDeSalir,
  registrarSenalesApagado,
  type MotivoApagado,
} from "../src/lib/server-lifecycle.ts";

function diferida<T>() {
  let resolver!: (value: T | PromiseLike<T>) => void;
  const promesa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver };
}

function crearServidorFalso(eventos: string[]) {
  let callbackCierre: ((error?: Error) => void) | undefined;
  let cierresForzados = 0;
  const server = {
    close(callback?: (error?: Error) => void) {
      eventos.push("http:cerrar");
      callbackCierre = callback;
      return server;
    },
    closeAllConnections() {
      eventos.push("http:forzar");
      cierresForzados += 1;
    },
  } as Pick<Server, "close" | "closeAllConnections">;

  return {
    server,
    completarCierre(error?: Error) {
      callbackCierre?.(error);
    },
    get cierresForzados() {
      return cierresForzados;
    },
  };
}

function crearDeadlineManual() {
  let callback: (() => void) | undefined;
  let cancelaciones = 0;
  let unrefs = 0;
  const timer = {
    unref() {
      unrefs += 1;
    },
  };

  return {
    programarTimeout(nuevoCallback: () => void) {
      callback = nuevoCallback;
      return timer;
    },
    cancelarTimeout(handle: typeof timer) {
      assert.strictEqual(handle, timer);
      cancelaciones += 1;
      callback = undefined;
    },
    vencer() {
      assert.ok(callback, "el deadline debe estar programado");
      callback();
    },
    get cancelaciones() {
      return cancelaciones;
    },
    get unrefs() {
      return unrefs;
    },
  };
}

function crearLoggerFalso() {
  return {
    info() {},
    error() {},
  };
}

async function conFusible<T>(promesa: Promise<T>, mensaje: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(mensaje)), 2_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe("apagado controlado", () => {
  it("es idempotente y espera en paralelo el drenaje de HTTP y tareas", async () => {
    const eventos: string[] = [];
    const servidor = crearServidorFalso(eventos);
    const tarea = diferida<void>();
    const deadline = crearDeadlineManual();
    let salidasForzadas = 0;

    const apagar = crearApagadoControlado({
      server: servidor.server,
      iniciarDrenaje: () => eventos.push("readiness:drenar"),
      detenerTareas: () => eventos.push("tareas:detener"),
      esperarTareas: () => {
        eventos.push("tareas:esperar");
        return tarea.promesa;
      },
      cerrarStreams: () => {
        eventos.push("sse:cerrar");
        return 2;
      },
      logger: crearLoggerFalso(),
      programarTimeout: deadline.programarTimeout,
      cancelarTimeout: deadline.cancelarTimeout,
      salir: () => {
        salidasForzadas += 1;
      },
    });

    const porSigterm = apagar("SIGTERM");
    const porSigint = apagar("SIGINT");
    assert.strictEqual(porSigint, porSigterm);
    assert.deepEqual(eventos, [
      "readiness:drenar",
      "tareas:detener",
      "http:cerrar",
      "sse:cerrar",
      "tareas:esperar",
    ]);
    servidor.completarCierre();
    await Promise.resolve();
    assert.equal(deadline.cancelaciones, 0);

    tarea.resolver();
    await porSigterm;
    assert.equal(deadline.cancelaciones, 0);
    assert.equal(deadline.unrefs, 1);
    assert.equal(servidor.cierresForzados, 0);
    assert.equal(salidasForzadas, 0);
  });

  it("fuerza conexiones y salida al vencer sin cerrar una base aun en uso", async () => {
    const eventos: string[] = [];
    const servidor = crearServidorFalso(eventos);
    const tarea = diferida<void>();
    const deadline = crearDeadlineManual();
    const codigosSalida: number[] = [];
    const mensajes: string[] = [];

    const apagar = crearApagadoControlado({
      server: servidor.server,
      iniciarDrenaje() {},
      detenerTareas: () => eventos.push("tareas:detener"),
      esperarTareas: () => tarea.promesa,
      cerrarStreams: () => 0,
      logger: {
        info(_contexto, mensaje) {
          mensajes.push(`info:${mensaje}`);
        },
        error(_contexto, mensaje) {
          mensajes.push(`error:${mensaje}`);
        },
      },
      programarTimeout: deadline.programarTimeout,
      cancelarTimeout: deadline.cancelarTimeout,
      salir: (codigo) => codigosSalida.push(codigo),
    });

    const resultado = apagar("SIGTERM");
    deadline.vencer();
    await resultado;

    assert.equal(servidor.cierresForzados, 1);
    assert.deepEqual(codigosSalida, [1]);
    assert.equal(
      mensajes.some((mensaje) => mensaje.includes("esperando salida")),
      false,
    );
  });

  it("conserva un watchdog sin referencia despues del drenaje visible", async () => {
    const eventos: string[] = [];
    const servidor = crearServidorFalso(eventos);
    const deadline = crearDeadlineManual();
    const salida = diferida<number>();
    const apagar = crearApagadoControlado({
      server: servidor.server,
      iniciarDrenaje() {},
      detenerTareas() {},
      esperarTareas: () => Promise.resolve(),
      cerrarStreams: () => 0,
      logger: crearLoggerFalso(),
      programarTimeout: deadline.programarTimeout,
      cancelarTimeout: deadline.cancelarTimeout,
      salir: (codigo) => salida.resolver(codigo),
    });

    const apagado = apagar("SIGTERM");
    servidor.completarCierre();
    await apagado;
    assert.equal(deadline.unrefs, 1);
    assert.equal(servidor.cierresForzados, 0);

    // Simula un handler cuyo socket ya cerro pero cuyo trabajo libuv mantiene
    // vivo el proceso hasta el deadline.
    deadline.vencer();
    assert.equal(
      await conFusible(salida.promesa, "el watchdog residual no forzo salida"),
      1,
    );
    assert.equal(servidor.cierresForzados, 1);
  });
});

it("posterga el cierre de SQLite hasta beforeExit", () => {
  const fuente = new EventEmitter();
  let cierres = 0;
  const desregistrar = registrarCierreAntesDeSalir(() => {
    cierres += 1;
  }, fuente);

  assert.equal(cierres, 0);
  fuente.emit("beforeExit");
  fuente.emit("beforeExit");
  assert.equal(cierres, 1);

  desregistrar();
  assert.equal(fuente.listenerCount("beforeExit"), 0);
});

it("no cierra SQLite mientras continua un handler cuyo cliente aborto", async () => {
  const handlerIniciado = diferida<void>();
  const continuarHandler = diferida<void>();
  const handlerFinalizado = diferida<void>();
  const fuenteSalida = new EventEmitter();
  let cierresBase = 0;
  const desregistrarBase = registrarCierreAntesDeSalir(() => {
    cierresBase += 1;
  }, fuenteSalida);
  const app = express();
  app.get("/slow", async (_req, res) => {
    handlerIniciado.resolver();
    await continuarHandler.promesa;
    if (!res.destroyed) res.status(204).end();
    handlerFinalizado.resolver();
  });

  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = request({
    host: "127.0.0.1",
    port: address.port,
    path: "/slow",
  });
  client.on("error", () => undefined);
  client.end();

  try {
    await conFusible(handlerIniciado.promesa, "el handler no fue alcanzado");
    const clientClosed = new Promise<void>((resolve) =>
      client.once("close", () => resolve()),
    );
    client.destroy();
    await conFusible(clientClosed, "el cliente abortado no cerro su socket");

    const deadline = crearDeadlineManual();
    const apagar = crearApagadoControlado({
      server,
      iniciarDrenaje() {},
      detenerTareas() {},
      esperarTareas: () => Promise.resolve(),
      cerrarStreams: () => 0,
      logger: crearLoggerFalso(),
      programarTimeout: deadline.programarTimeout,
      cancelarTimeout: deadline.cancelarTimeout,
      salir: () => assert.fail("el drenaje visible no debe forzar la salida"),
    });

    await conFusible(apagar("SIGTERM"), "server.close no termino");
    assert.equal(cierresBase, 0);
    assert.equal(deadline.unrefs, 1);

    continuarHandler.resolver();
    await conFusible(handlerFinalizado.promesa, "el handler no se reanudo");
    assert.equal(cierresBase, 0);
    fuenteSalida.emit("beforeExit");
    assert.equal(cierresBase, 1);
  } finally {
    continuarHandler.resolver();
    client.destroy();
    server.closeAllConnections();
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    desregistrarBase();
  }
});

it("no registra SSE si el cliente aborto durante middleware asincrono", async () => {
  const middlewareIniciado = diferida<void>();
  const continuarMiddleware = diferida<void>();
  const rutaEjecutada = diferida<boolean>();
  const app = express();
  app.get(
    "/events-aborted",
    async (_req, _res, next) => {
      middlewareIniciado.resolver();
      await continuarMiddleware.promesa;
      next();
    },
    (_req, res) => {
      rutaEjecutada.resolver(addEventClient(res));
    },
  );

  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = request({
    host: "127.0.0.1",
    port: address.port,
    path: "/events-aborted",
  });
  client.on("error", () => undefined);
  client.end();

  try {
    await conFusible(
      middlewareIniciado.promesa,
      "el middleware SSE no fue alcanzado",
    );
    const clientClosed = new Promise<void>((resolve) =>
      client.once("close", () => resolve()),
    );
    client.destroy();
    await conFusible(clientClosed, "el cliente SSE abortado no cerro");
    continuarMiddleware.resolver();
    assert.equal(
      await conFusible(rutaEjecutada.promesa, "la ruta SSE no continuo"),
      false,
    );
  } finally {
    continuarMiddleware.resolver();
    client.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("rechaza un SSE que intenta registrarse despues de iniciar el drenaje", async () => {
  const entroEnRuta = diferida<void>();
  const continuarRegistro = diferida<void>();
  const app = express();
  app.get("/events", async (_req, res) => {
    entroEnRuta.resolver();
    await continuarRegistro.promesa;
    if (!addEventClient(res)) return;
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    res.flushHeaders();
    res.write("retry: 5000\n\n");
  });

  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const responsePromise = fetch(`http://127.0.0.1:${address.port}/events`);
    await conFusible(entroEnRuta.promesa, "la ruta SSE no fue alcanzada");

    const deadline = crearDeadlineManual();
    const apagar = crearApagadoControlado({
      server,
      iniciarDrenaje() {},
      detenerTareas() {},
      esperarTareas: () => Promise.resolve(),
      cerrarStreams: beginEventClientShutdown,
      logger: crearLoggerFalso(),
      programarTimeout: deadline.programarTimeout,
      cancelarTimeout: deadline.cancelarTimeout,
      salir: () => assert.fail("el drenaje SSE no debe forzar la salida"),
    });

    const apagado = apagar("SIGTERM");
    continuarRegistro.resolver();
    const response = await conFusible(
      responsePromise,
      "el alta SSE tardia mantuvo abierto el socket",
    );
    assert.equal(response.status, 503);
    await response.arrayBuffer();
    await conFusible(apagado, "el servidor no termino de drenar");
    assert.equal(server.listening, false);
    assert.equal(deadline.unrefs, 1);
  } finally {
    continuarRegistro.resolver();
    server.closeAllConnections();
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

it("registra y desregistra SIGINT y SIGTERM sin tocar las senales reales", () => {
  const fuente = new EventEmitter();
  const motivos: MotivoApagado[] = [];
  const desregistrar = registrarSenalesApagado((motivo) => {
    motivos.push(motivo);
    return Promise.resolve();
  }, fuente);

  fuente.emit("SIGTERM");
  fuente.emit("SIGINT");
  assert.deepEqual(motivos, ["SIGTERM", "SIGINT"]);

  desregistrar();
  assert.equal(fuente.listenerCount("SIGTERM"), 0);
  assert.equal(fuente.listenerCount("SIGINT"), 0);
});

it("mantiene Docker alineado con el deadline interno", () => {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const dockerfile = readFileSync(
    path.join(repoRoot, "Dockerfile.backend"),
    "utf8",
  );
  const compose = readFileSync(
    path.join(repoRoot, "docker-compose.yml"),
    "utf8",
  );

  assert.match(
    dockerfile,
    /&& exec node --enable-source-maps dist\/index\.mjs/,
  );
  const grace = compose.match(/stop_grace_period:\s*(\d+)s/);
  assert.ok(grace?.[1], "Compose debe declarar stop_grace_period");
  assert.ok(Number(grace[1]) * 1_000 > APAGADO_TIMEOUT_PREDETERMINADO_MS);
});
