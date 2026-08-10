import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import {
  addEventClient,
  beginEventClientShutdown,
  broadcastEvent,
  closeEventClientsForSessionHash,
  closeEventClientsForUsers,
  revokeEventClientsForUsers,
} from "../src/lib/events.ts";

function fakeResponse(write: (payload: string) => void): Response {
  let closeListener: (() => void) | undefined;
  const response = {
    closed: false,
    destroyed: false,
    writableEnded: false,
    headersSent: false,
    req: { aborted: false },
    socket: { destroyed: false },
    statusCode: 200,
    on(event: string, listener: () => void) {
      if (event === "close") closeListener = listener;
      return this;
    },
    write,
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    set() {
      return this;
    },
    end() {
      this.writableEnded = true;
      closeListener?.();
      return this;
    },
    destroy() {
      this.destroyed = true;
      closeListener?.();
      return this;
    },
  };
  return response as unknown as Response;
}

test("rechaza cualquier respuesta cuyo cierre ya observo el servidor", () => {
  const terminalSignals: Array<{
    name: string;
    set: (response: Response) => void;
  }> = [
    {
      name: "response closed",
      set: (response) => Object.assign(response, { closed: true }),
    },
    {
      name: "response destroyed",
      set: (response) => Object.assign(response, { destroyed: true }),
    },
    {
      name: "response ended",
      set: (response) => Object.assign(response, { writableEnded: true }),
    },
    {
      name: "request aborted",
      set: (response) => Object.assign(response.req, { aborted: true }),
    },
    {
      name: "socket destroyed",
      set: (response) =>
        Object.assign(response.socket as NonNullable<Response["socket"]>, {
          destroyed: true,
        }),
    },
  ];

  for (const signal of terminalSignals) {
    const response = fakeResponse(() =>
      assert.fail(`no debe escribir despues de ${signal.name}`),
    );
    signal.set(response);
    assert.equal(addEventClient(response), false, signal.name);
  }
});

test("un cliente SSE desconectado no interrumpe la notificación de los demás", () => {
  let failedWrites = 0;
  const received: string[] = [];
  const failed = fakeResponse(() => {
    failedWrites += 1;
    throw new Error("socket cerrado");
  });
  const healthy = fakeResponse((payload) => {
    received.push(payload);
  });

  addEventClient(failed);
  addEventClient(healthy);

  assert.doesNotThrow(() =>
    broadcastEvent("ticket_actualizado", {
      ticket_id: 7,
      tipo: "tipo_no_autorizado",
    }),
  );
  broadcastEvent("datos_actualizados");

  assert.equal(
    failedWrites,
    1,
    "el cliente fallido debe quitarse del conjunto",
  );
  assert.equal(received.length, 2);
  assert.match(received[0] ?? "", /"ticket_id":7/);
  assert.match(received[0] ?? "", /"tipo":"ticket_actualizado"/);
  assert.doesNotMatch(received[0] ?? "", /tipo_no_autorizado/);
  healthy.end();
});

test("cierra de inmediato los streams de una sesión o un usuario revocados", () => {
  const received: string[] = [];
  const userOne = fakeResponse((payload) => received.push(payload));
  const userTwo = fakeResponse((payload) => received.push(payload));
  addEventClient(userOne, { usuarioId: 1, sessionTokenHash: "hash-1" });
  addEventClient(userTwo, { usuarioId: 2, sessionTokenHash: "hash-2" });

  assert.equal(closeEventClientsForUsers([1]), 1);
  assert.equal(userOne.writableEnded, true);
  assert.equal(userTwo.writableEnded, false);
  assert.equal(closeEventClientsForSessionHash("hash-2"), 1);
  assert.equal(userTwo.writableEnded, true);
  assert.equal(closeEventClientsForSessionHash("hash-2"), 0);
  assert.deepEqual(received, [], "el cierre técnico debe ser silencioso");
});

test("avisa la revocación administrativa antes de cerrar cada stream", () => {
  const received: string[] = [];
  const failed = fakeResponse(() => {
    throw new Error("socket cerrado");
  });
  const healthy = fakeResponse((payload) => received.push(payload));
  const unrelatedWrites: string[] = [];
  const unrelated = fakeResponse((payload) => unrelatedWrites.push(payload));

  addEventClient(failed, { usuarioId: 7 });
  addEventClient(healthy, { usuarioId: 7 });
  addEventClient(unrelated, { usuarioId: 8 });

  assert.doesNotThrow(() => revokeEventClientsForUsers([7]));
  assert.equal(failed.destroyed, true);
  assert.equal(healthy.writableEnded, true);
  assert.equal(unrelated.writableEnded, false);
  assert.deepEqual(received, ['data: {"tipo":"sesion_revocada"}\n\n']);
  assert.deepEqual(unrelatedWrites, []);
  assert.equal(revokeEventClientsForUsers([7]), 0);

  unrelated.end();
});

test("drena streams y rechaza silenciosamente un alta tardia", () => {
  const received: string[] = [];
  const first = fakeResponse((payload) => received.push(payload));
  const second = fakeResponse((payload) => received.push(payload));
  const aborted = fakeResponse((payload) => received.push(payload));
  aborted.destroy();
  assert.equal(addEventClient(aborted, { usuarioId: 99 }), false);

  addEventClient(first, { usuarioId: 1 });
  addEventClient(second, { usuarioId: 2 });

  assert.equal(beginEventClientShutdown(), 2);
  assert.equal(first.writableEnded, true);
  assert.equal(second.writableEnded, true);

  const late = fakeResponse((payload) => received.push(payload));
  assert.equal(addEventClient(late, { usuarioId: 3 }), false);
  assert.equal(late.writableEnded, true);
  assert.equal(late.statusCode, 503);
  assert.equal(beginEventClientShutdown(), 0);
  broadcastEvent("datos_actualizados");
  assert.deepEqual(received, []);
});
