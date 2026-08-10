import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  expect,
  test,
  type Page,
  type Request,
  type Response as PlaywrightResponse,
} from "@playwright/test";
import {
  E2E_ADMIN_API_KEY,
  E2E_AGENT_PASSWORD,
  E2E_AGENT_TEMP_PASSWORD,
  E2E_SYSADMIN_PASSWORD,
  E2E_WEBHOOK_API_KEY,
} from "../support/environment";

interface IngestedTicket {
  id: number;
  version: number;
}

interface IngestResponse {
  created: boolean;
  ticket: IngestedTicket;
}

interface DashboardStatsResponse {
  total: number;
}

interface TicketSnapshot {
  version: number;
  notas: string | null;
}

interface AdminRoleListResponse {
  roles: Array<{ id: number; nombre: string }>;
}

interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  postData: string | null;
}

async function login(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

async function completeRequiredPasswordChange(
  page: Page,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await expect(page).toHaveURL(/\/cambiar-contrasena$/);
  await page
    .getByLabel("Contraseña temporal", { exact: true })
    .fill(currentPassword);
  await page.getByLabel("Contraseña nueva", { exact: true }).fill(newPassword);
  await page
    .getByLabel("Repetir contraseña nueva", { exact: true })
    .fill(newPassword);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function loginSysAdmin(page: Page): Promise<void> {
  await login(page, "sysadmin", E2E_SYSADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function elevate(page: Page): Promise<void> {
  await page
    .getByLabel("Clave de administración", { exact: true })
    .fill(E2E_ADMIN_API_KEY);
  await page.getByRole("button", { name: "Habilitar" }).click();
  await expect(
    page.getByText("Acceso administrativo habilitado", { exact: false }),
  ).toBeVisible();
}

async function ingestTicket(
  page: Page,
  body: Record<string, unknown>,
): Promise<IngestResponse> {
  const response = await page.request.post("/api/webhooks/ticket", {
    headers: { "x-api-key": E2E_WEBHOOK_API_KEY },
    data: body,
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as IngestResponse;
}

function captureRequest(request: Request): CapturedRequest {
  return {
    method: request.method(),
    url: request.url(),
    headers: request.headers(),
    postData: request.postData(),
  };
}

function uniqueValue(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function isRegisteredEventStream(response: PlaywrightResponse): boolean {
  return (
    new URL(response.url()).pathname === "/api/events" &&
    response.status() === 200 &&
    response.headers()["content-type"]?.startsWith("text/event-stream") === true
  );
}

function isOperationalTicketListResponse(
  response: PlaywrightResponse,
): boolean {
  const url = new URL(response.url());
  return (
    response.request().method() === "GET" &&
    url.pathname === "/api/tickets" &&
    !url.searchParams.has("search") &&
    response.status() === 200
  );
}

function isTicketListResponseForSearch(
  response: PlaywrightResponse,
  search: string,
): boolean {
  const url = new URL(response.url());
  return (
    response.request().method() === "GET" &&
    url.pathname === "/api/tickets" &&
    url.searchParams.get("search") === search &&
    response.status() === 200
  );
}

async function searchOperationalTickets(
  page: Page,
  search: string,
): Promise<void> {
  const filteredResponse = page.waitForResponse((response) =>
    isTicketListResponseForSearch(response, search),
  );
  await page.getByLabel("Buscar tickets").fill(search);
  await filteredResponse;
}

async function createTemporaryUser(
  page: Page,
  username: string,
  email: string,
): Promise<void> {
  const elevationResponse = await page.request.post(
    "/api/auth/admin-elevation",
    { data: { admin_key: E2E_ADMIN_API_KEY } },
  );
  expect(elevationResponse.ok()).toBe(true);
  const adminHeaders = { "x-admin-intent": "1" };
  const rolesResponse = await page.request.get("/api/admin/roles?limit=100", {
    headers: adminHeaders,
  });
  expect(rolesResponse.ok()).toBe(true);
  const roleList = (await rolesResponse.json()) as AdminRoleListResponse;
  const operatorRole = roleList.roles.find(
    (role) => role.nombre === "Operador",
  );
  if (!operatorRole) throw new Error("No se encontró el rol base Operador");

  const createResponse = await page.request.post("/api/admin/users", {
    headers: adminHeaders,
    data: {
      nombre: "Primer ingreso",
      apellido: "E2E",
      username,
      password: E2E_AGENT_TEMP_PASSWORD,
      email,
      role_id: operatorRole.id,
      activo: true,
    },
  });
  expect(createResponse.status()).toBe(201);
}

test("primer ingreso, cambio obligatorio, logout y guardas públicas", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const username = `primer-ingreso-${suffix}`;
  await loginSysAdmin(page);
  await createTemporaryUser(
    page,
    username,
    `primer-ingreso-${suffix}@example.test`,
  );
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();

  await login(page, username, E2E_AGENT_TEMP_PASSWORD);
  await completeRequiredPasswordChange(
    page,
    E2E_AGENT_TEMP_PASSWORD,
    E2E_AGENT_PASSWORD,
  );

  await expect(
    page.getByRole("heading", { name: "Sistema de Tickets" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();

  await page.goto("/tickets");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();
});

test("ingesta en vivo, clasificación Serin, gestión y auditoría", async ({
  page,
}) => {
  const eventStream = page.waitForResponse(isRegisteredEventStream);
  await loginSysAdmin(page);
  await eventStream;
  const initialTicketList = page.waitForResponse(
    isOperationalTicketListResponse,
  );
  await page.getByRole("link", { name: /^Tickets/ }).click();
  await expect(page).toHaveURL(/\/tickets$/);
  await initialTicketList;

  const ingested = await ingestTicket(page, {
    conversation_id: uniqueValue("e2e-sse-ticket"),
    hora: "10:25",
    nombre: "Valentina",
    apellido: "SSE",
    telefono: "1160000001",
    dni: "30111222",
    empresa: "GSB E2E",
    estado_empleado: "Activo",
    email: "valentina.e2e@example.test",
    motivo: "Consulta por embargo judicial",
    resumen: "Necesita conocer el estado de un embargo.",
  });

  const ticketLink = page.getByRole("link", {
    name: new RegExp(`Abrir ticket #${ingested.ticket.id}`),
  });
  await expect(ticketLink).toBeVisible();
  await ticketLink.click();

  await expect(
    page.getByText(
      "Los datos fueron extraídos y persistidos desde Serin con el DNI proporcionado.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar Estado" }).click();
  await page.getByLabel("Estado").click();
  await page.getByRole("option", { name: "EN PROCESO" }).click();
  await page.getByRole("button", { name: "Guardar Cambios" }).click();

  await expect(page.getByText("Asignado a: SysAdmin")).toBeVisible();
  await expect(page.getByText("Cambio de asignación:")).toBeVisible();
  await expect(page.getByText("Cambio de estado:")).toBeVisible();
});

test("elevación efímera, CRUD RBAC y revocación SSE de otra sesión", async ({
  browser,
  page,
}) => {
  const requests: CapturedRequest[] = [];
  page.on("request", (request) => {
    requests.push(captureRequest(request));
  });

  const roleName = uniqueValue("Operador E2E");
  const agentUsername = uniqueValue("agente-e2e");
  const agentEmail = `${agentUsername}@example.test`;

  await loginSysAdmin(page);
  await page.goto("/admin/roles-usuarios");
  await elevate(page);

  await page.getByRole("tab", { name: "Roles" }).click();
  await page.getByRole("button", { name: "Nuevo rol" }).click();
  const roleDialog = page.getByRole("dialog", { name: "Nuevo rol" });
  await roleDialog.getByLabel("Nombre *").fill(roleName);
  await roleDialog
    .getByLabel("Descripción")
    .fill("Rol temporal para validar revocación de sesiones.");
  await roleDialog.getByRole("button", { name: "Guardar rol" }).click();
  const rolesPanel = page.getByRole("tabpanel", { name: "Roles" });
  await expect(rolesPanel.getByText(roleName, { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Usuarios" }).click();
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const userDialog = page.getByRole("dialog", { name: "Nuevo usuario" });
  await userDialog.getByLabel("Nombre *").fill("Agente");
  await userDialog.getByLabel("Apellido").fill("E2E");
  await userDialog.getByLabel("Nombre de usuario *").fill(agentUsername);
  await userDialog.getByLabel("Email *").fill(agentEmail);
  await userDialog
    .getByLabel("Contraseña temporal *", { exact: true })
    .fill(E2E_AGENT_TEMP_PASSWORD);
  await userDialog
    .getByLabel("Repetir contraseña temporal *", { exact: true })
    .fill(E2E_AGENT_TEMP_PASSWORD);
  await userDialog.getByLabel("Rol *").click();
  await page.getByRole("option", { name: roleName, exact: true }).click();
  await userDialog.getByRole("button", { name: "Guardar usuario" }).click();
  const usersPanel = page.getByRole("tabpanel", { name: "Usuarios" });
  await expect(
    usersPanel.getByText(agentUsername, { exact: true }),
  ).toBeVisible();

  const agentContext = await browser.newContext();
  const agentPage = await agentContext.newPage();
  try {
    const agentEventStream = agentPage.waitForResponse(isRegisteredEventStream);
    await login(agentPage, agentUsername, E2E_AGENT_TEMP_PASSWORD);
    await completeRequiredPasswordChange(
      agentPage,
      E2E_AGENT_TEMP_PASSWORD,
      E2E_AGENT_PASSWORD,
    );
    await expect(agentPage).toHaveURL(/\/dashboard$/);
    await agentEventStream;

    await usersPanel
      .getByRole("switch", {
        name: `Desactivar usuario ${agentUsername}`,
      })
      .click();
    await expect(
      usersPanel.getByRole("switch", {
        name: `Activar usuario ${agentUsername}`,
      }),
    ).toBeVisible();
    await expect(agentPage).toHaveURL(/\/$/);
    await expect(
      agentPage.getByRole("button", { name: "Ingresar" }),
    ).toBeVisible();
  } finally {
    await agentContext.close();
  }

  const elevationRequests = requests.filter(
    (request) =>
      request.method === "POST" &&
      new URL(request.url).pathname === "/api/auth/admin-elevation",
  );
  expect(elevationRequests).toHaveLength(1);
  const elevationRequest = elevationRequests[0];
  if (!elevationRequest) throw new Error("No se capturó el POST de elevación");
  expect(JSON.parse(elevationRequest.postData ?? "null")).toEqual({
    admin_key: E2E_ADMIN_API_KEY,
  });
  expect(
    requests.some((request) => request.url.includes(E2E_ADMIN_API_KEY)),
  ).toBe(false);
  expect(
    requests.some((request) =>
      Object.values(request.headers).some((value) =>
        value.includes(E2E_ADMIN_API_KEY),
      ),
    ),
  ).toBe(false);
  expect(
    requests
      .filter((request) => request !== elevationRequest)
      .some((request) => request.postData?.includes(E2E_ADMIN_API_KEY)),
  ).toBe(false);
  expect(requests.some((request) => "x-admin-key" in request.headers)).toBe(
    false,
  );
  const protectedAdminMutations = requests.filter(
    (request) =>
      ["POST", "PATCH", "DELETE"].includes(request.method) &&
      new URL(request.url).pathname.startsWith("/api/admin/"),
  );
  expect(protectedAdminMutations.length).toBeGreaterThan(0);
  expect(
    protectedAdminMutations.every(
      (request) => request.headers["x-admin-intent"] === "1",
    ),
  ).toBe(true);

  const browserStorage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(browserStorage.includes(E2E_ADMIN_API_KEY)).toBe(false);
  await expect(
    page.getByLabel("Clave de administración", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Revocar acceso" }).click();
  await expect(
    page.getByLabel("Clave de administración", { exact: true }),
  ).toBeVisible();
});

test("cuarentena, conflicto optimista y exportación CSV operativa", async ({
  page,
}) => {
  const exportScope = uniqueValue("e2e-export-scope");
  const quarantineConversation = `${exportScope}-quarantine`;
  const casConversation = `${exportScope}-cas`;
  const winningNotes = `Edición ganadora ${exportScope}`;
  const staleDraft = `Edición obsoleta ${exportScope}`;

  await loginSysAdmin(page);

  const initialStatsResponse = await page.request.get("/api/dashboard/stats");
  expect(initialStatsResponse.ok()).toBe(true);
  const initialStats =
    (await initialStatsResponse.json()) as DashboardStatsResponse;

  const quarantined = await ingestTicket(page, {
    conversation_id: quarantineConversation,
    hora: "",
    nombre: "",
    apellido: "",
    motivo: "",
  });
  const afterQuarantineResponse = await page.request.get(
    "/api/dashboard/stats",
  );
  expect(afterQuarantineResponse.ok()).toBe(true);
  const afterQuarantine =
    (await afterQuarantineResponse.json()) as DashboardStatsResponse;
  expect(afterQuarantine.total).toBe(initialStats.total);

  await page.goto("/tickets");
  await searchOperationalTickets(page, quarantineConversation);
  await expect(
    page.getByRole("link", {
      name: `Abrir ticket #${quarantined.ticket.id}`,
    }),
  ).toHaveCount(0);
  await expect(page.getByText("No se encontraron llamados")).toBeVisible();

  await page.goto("/admin");
  await elevate(page);
  await page
    .getByLabel("Buscar registros administrativos")
    .fill(quarantineConversation);
  await expect(
    page.getByRole("link", {
      name: `Abrir ticket #${quarantined.ticket.id}`,
    }),
  ).toBeVisible();

  const casTicket = await ingestTicket(page, {
    conversation_id: casConversation,
    hora: "15:40",
    nombre: "Carlos",
    apellido: "Concurrencia",
    motivo: "Consulta general para control optimista",
  });

  await page.goto(`/tickets/${casTicket.ticket.id}`);
  await page.getByRole("button", { name: "Editar Estado" }).click();
  const managementDialog = page.getByRole("dialog", {
    name: "Actualizar Ticket",
  });
  await managementDialog.getByLabel("Notas Internas").fill(staleDraft);

  const winningUpdate = await page.request.patch(
    `/api/tickets/${casTicket.ticket.id}`,
    {
      data: {
        expected_version: casTicket.ticket.version,
        notas: winningNotes,
      },
    },
  );
  expect(winningUpdate.ok()).toBe(true);
  const winningTicket = (await winningUpdate.json()) as TicketSnapshot;
  expect(winningTicket).toMatchObject({
    version: casTicket.ticket.version + 1,
    notas: winningNotes,
  });

  const conflictResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "PATCH" &&
      url.pathname === `/api/tickets/${casTicket.ticket.id}` &&
      response.status() === 409
    );
  });
  await managementDialog
    .getByRole("button", { name: "Guardar Cambios" })
    .click();
  const conflictResponse = await conflictResponsePromise;
  await expect(conflictResponse.json()).resolves.toMatchObject({
    code: "TICKET_VERSION_CONFLICT",
    ticket_id: casTicket.ticket.id,
  });
  await expect(
    managementDialog.getByText("Hay una versión más reciente"),
  ).toBeVisible();
  await expect(managementDialog.getByLabel("Notas Internas")).toHaveValue(
    staleDraft,
  );

  const persistedResponse = await page.request.get(
    `/api/tickets/${casTicket.ticket.id}`,
  );
  expect(persistedResponse.ok()).toBe(true);
  const persistedTicket = (await persistedResponse.json()) as TicketSnapshot;
  expect(persistedTicket).toMatchObject({
    version: winningTicket.version,
    notas: winningNotes,
  });
  expect(persistedTicket.notas).not.toBe(staleDraft);

  await page.goto("/tickets");
  await searchOperationalTickets(page, exportScope);
  await expect(
    page.getByRole("link", {
      name: new RegExp(`Abrir ticket #${casTicket.ticket.id}`),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `Abrir ticket #${quarantined.ticket.id}`,
    }),
  ).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Exportar todos los tickets filtrados a CSV",
    })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const downloadPath = await download.path();
  if (downloadPath === null) {
    throw new Error("Playwright no pudo materializar la descarga CSV");
  }
  const csv = await readFile(downloadPath, "utf8");
  expect(csv).toContain(casConversation);
  expect(csv).toContain("Carlos");
  expect(csv).toContain(winningNotes);
  expect(csv).not.toContain(staleDraft);
  expect(csv).not.toContain(quarantineConversation);
});
