import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test, { after } from "node:test";

const testDirectory = join(process.cwd(), "tmp", "backend-app-tests");
const databasePath = join(testDirectory, `app-${process.pid}.db`);
mkdirSync(testDirectory, { recursive: true });
rmSync(databasePath, { force: true });
process.env.TICKETS_DB_PATH = databasePath;
process.env.NODE_ENV = "test";

let server: Server | undefined;
let closeDatabase: (() => void) | undefined;
after(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  }
  closeDatabase?.();
  rmSync(databasePath, { force: true });
});

const [{ default: app }, { sqlite }] = await Promise.all([
  import("../src/app.ts"),
  import("@workspace/db"),
]);
closeDatabase = () => {
  if (sqlite.open) sqlite.close();
};
server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}`;

function assertNoCorsHeaders(response: Response): void {
  const corsHeaders: string[] = [];
  response.headers.forEach((_value, name) => {
    if (name.startsWith("access-control-")) corsHeaders.push(name);
  });
  assert.deepEqual(corsHeaders, []);
}

test("mantiene la API same-origin sin publicar CORS ni la firma de Express", async () => {
  const sameOrigin = await fetch(`${baseUrl}/api/healthz`);
  assert.equal(sameOrigin.status, 200);
  assert.deepEqual(await sameOrigin.json(), { status: "ok" });
  assert.equal(sameOrigin.headers.get("x-powered-by"), null);
  assertNoCorsHeaders(sameOrigin);

  const crossOrigin = await fetch(`${baseUrl}/api/healthz`, {
    headers: { origin: "https://origen-no-confiable.example" },
  });
  assert.equal(crossOrigin.status, 200);
  assert.equal(crossOrigin.headers.get("x-powered-by"), null);
  assertNoCorsHeaders(crossOrigin);

  const preflight = await fetch(`${baseUrl}/api/healthz`, {
    method: "OPTIONS",
    headers: {
      origin: "https://origen-no-confiable.example",
      "access-control-request-method": "GET",
    },
  });
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get("x-powered-by"), null);
  assertNoCorsHeaders(preflight);
});
