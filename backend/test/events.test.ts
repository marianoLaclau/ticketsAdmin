import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import {
  addEventClient,
  broadcastEvent,
  closeEventClientsForSession,
  closeEventClientsForUsers,
} from "../src/lib/events.ts";

function fakeResponse(write: (payload: string) => void): Response {
  let closeListener: (() => void) | undefined;
  const response = {
    destroyed: false,
    writableEnded: false,
    on(event: string, listener: () => void) {
      if (event === "close") closeListener = listener;
      return this;
    },
    write,
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
    broadcastEvent("ticket_actualizado", { ticket_id: 7 }),
  );
  broadcastEvent("datos_actualizados");

  assert.equal(
    failedWrites,
    1,
    "el cliente fallido debe quitarse del conjunto",
  );
  assert.equal(received.length, 2);
  assert.match(received[0] ?? "", /"ticket_id":7/);
  healthy.end();
});

test("cierra de inmediato los streams de una sesión o un usuario revocados", () => {
  const userOne = fakeResponse(() => undefined);
  const userTwo = fakeResponse(() => undefined);
  addEventClient(userOne, { usuarioId: 1, sessionToken: "sesion-1" });
  addEventClient(userTwo, { usuarioId: 2, sessionToken: "sesion-2" });

  assert.equal(closeEventClientsForUsers([1]), 1);
  assert.equal(userOne.writableEnded, true);
  assert.equal(userTwo.writableEnded, false);
  assert.equal(closeEventClientsForSession("sesion-2"), 1);
  assert.equal(userTwo.writableEnded, true);
  assert.equal(closeEventClientsForSession("sesion-2"), 0);
});
