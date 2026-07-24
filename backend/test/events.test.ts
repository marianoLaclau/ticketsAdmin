import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { addEventClient, broadcastEvent } from "../src/lib/events.ts";

function fakeResponse(write: (payload: string) => void): Response {
  return {
    destroyed: false,
    writableEnded: false,
    on() {
      return this;
    },
    write,
  } as unknown as Response;
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

  assert.doesNotThrow(() => broadcastEvent("ticket_actualizado", { ticket_id: 7 }));
  broadcastEvent("datos_actualizados");

  assert.equal(failedWrites, 1, "el cliente fallido debe quitarse del conjunto");
  assert.equal(received.length, 2);
  assert.match(received[0] ?? "", /"ticket_id":7/);
});
