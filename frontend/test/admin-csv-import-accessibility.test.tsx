import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { AdminImportResult } from "@workspace/api-client-react";
import { Tabs } from "../src/components/ui/tabs.tsx";
import { Toaster } from "../src/components/ui/toaster.tsx";
import { AdminCsvImportTab } from "../src/features/admin-tickets/AdminCsvImportTab.tsx";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createImportResult(dryRun: boolean): AdminImportResult {
  return {
    dry_run: dryRun,
    filas: 3,
    insertados: 2,
    ya_existentes: 1,
    invalidos: 0,
    columnas: [],
    sin_mapear: [],
    advertencias: [],
  };
}

function createCsvFile(): File {
  const csv = "conversation_id;nombre\ncall-1;Ada";
  const file = new File([csv], "tickets.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: async () => csv,
  });
  return file;
}

function renderImportTab(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Tabs value="importar">
        <AdminCsvImportTab
          request={{ headers: { "x-admin-intent": "1" } }}
          adminAccessState="ready"
          accessVersion={1}
          accessGeneration={0}
        />
      </Tabs>
    </QueryClientProvider>,
  );
}

test("anuncia lectura, simulación e importación CSV sin alertas intrusivas", async (t) => {
  const simulation = deferred<Response>();
  const definitiveImport = deferred<Response>();
  let requestCount = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requestCount += 1;
    return requestCount === 1 ? simulation.promise : definitiveImport.promise;
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  renderImportTab(queryClient);

  const fileInput = screen.getByLabelText(
    "Seleccionar archivo CSV para importar",
  );
  fireEvent.change(fileInput, { target: { files: [createCsvFile()] } });

  await waitFor(() => assert.equal(requestCount, 1));
  const status = screen.getByRole("status");
  assert.equal(status.getAttribute("aria-live"), "polite");
  assert.equal(status.getAttribute("aria-atomic"), "true");
  assert.equal(status.textContent, "Analizando archivo CSV.");
  assert.equal(
    status.closest("[aria-busy]")?.getAttribute("aria-busy"),
    "true",
  );
  assert.equal(screen.queryByRole("alert"), null);

  await act(async () => {
    simulation.resolve(jsonResponse(createImportResult(true)));
    await simulation.promise;
  });
  await waitFor(() =>
    assert.equal(
      status.textContent,
      "Simulación completada. 3 filas leídas: 2 a insertar, 1 ya existente y 0 inválidas.",
    ),
  );

  fireEvent.click(screen.getByRole("button", { name: "Importar 2 registros" }));
  await waitFor(() => assert.equal(requestCount, 2));
  assert.equal(status.textContent, "Importando archivo CSV.");
  assert.equal(
    status.closest("[aria-busy]")?.getAttribute("aria-busy"),
    "true",
  );

  await act(async () => {
    definitiveImport.resolve(jsonResponse(createImportResult(false)));
    await definitiveImport.promise;
  });
  await waitFor(() =>
    assert.equal(
      status.textContent,
      "Importación completada. 3 filas leídas: 2 insertadas, 1 ya existente y 0 inválidas.",
    ),
  );
  assert.equal(
    status.closest("[aria-busy]")?.getAttribute("aria-busy"),
    "false",
  );
  assert.equal(screen.queryByRole("alert"), null);
});

test("anuncia el error CSV una sola vez y conserva el mensaje visible", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ detail: "CSV inválido" }, 422),
  );
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  t.after(() => {
    cleanup();
    queryClient.clear();
  });
  renderImportTab(queryClient);
  render(<Toaster />);

  fireEvent.change(
    screen.getByLabelText("Seleccionar archivo CSV para importar"),
    { target: { files: [createCsvFile()] } },
  );

  await waitFor(() =>
    assert.ok(screen.getByText("No se pudo analizar el archivo")),
  );
  assert.equal(document.getElementById("csv-import-status")?.textContent, "");
  await waitFor(() => {
    const assertiveAnnouncements = Array.from(
      document.querySelectorAll('[aria-live="assertive"]'),
    );
    assert.ok(
      assertiveAnnouncements.some((announcement) =>
        announcement.textContent?.includes(
          "Revisá los datos ingresados e intentá nuevamente.",
        ),
      ),
    );
  });
  assert.equal(screen.queryByRole("alert"), null);
});
