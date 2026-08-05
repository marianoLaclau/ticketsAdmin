import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { createHealthRouter } from "../src/routes/health.ts";

async function withHealthServer(
  isReady: () => boolean,
  reportFailure: (error: unknown) => void,
  exercise: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(createHealthRouter({ isReady, reportFailure }));
  const server: Server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    await exercise(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("readyz falla cerrado sin exponer el error de la dependencia", async () => {
  const sentinel = new Error("sqlite-secret-path/sentinel");
  const reported: unknown[] = [];

  await withHealthServer(
    () => {
      throw sentinel;
    },
    (error) => reported.push(error),
    async (baseUrl) => {
      const unavailable = await fetch(`${baseUrl}/readyz`);
      const body = await unavailable.text();
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.headers.get("cache-control"), "no-store");
      assert.deepEqual(JSON.parse(body), { status: "unavailable" });
      assert.equal(body.includes(sentinel.message), false);

      const alive = await fetch(`${baseUrl}/healthz`);
      assert.equal(alive.status, 200);
      assert.deepEqual(await alive.json(), { status: "ok" });
    },
  );

  assert.deepEqual(reported, [sentinel]);
});
