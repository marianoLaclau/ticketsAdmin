import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const contractPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));
const source = readFileSync(contractPath, "utf8");
const contract = parse(source);

const unconditionalAdminOperations = [
  ["/admin/tickets", "post"],
  ["/admin/import", "post"],
  ["/admin/truncate", "post"],
  ["/admin/roles", "get"],
  ["/admin/roles", "post"],
  ["/admin/roles/{id}", "patch"],
  ["/admin/roles/{id}", "delete"],
  ["/admin/users", "get"],
  ["/admin/users", "post"],
  ["/admin/users/{id}", "patch"],
  ["/admin/users/{id}/password", "post"],
  ["/tickets/{id}", "delete"],
];

const conditionalAdminOperations = [
  ["/tickets", "get"],
  ["/tickets/{id}", "get"],
  ["/tickets/{id}", "patch"],
  ["/tickets/{id}/seguimientos", "get"],
  ["/tickets/{id}/seguimientos", "post"],
];

const elevationOperations = [
  ["/auth/admin-elevation", "get"],
  ["/auth/admin-elevation", "post"],
  ["/auth/admin-elevation", "delete"],
];

const operationAt = (path, method) => {
  const operation = contract.paths?.[path]?.[method];
  assert.ok(operation, `Falta ${method.toUpperCase()} ${path}`);
  return operation;
};

const responseSchemaRef = (operation, status) =>
  operation.responses?.[status]?.content?.["application/json"]?.schema?.$ref;

const assertDocumentsAdminElevation = (description, context) => {
  const documentedConcepts = [
    ["rol SysAdmin", /sysadmin/i],
    ["elevacion administrativa vigente", /elevacion administrativa vigente/i],
    ["header de intencion", /x-admin-intent/i],
    ["valor literal", /valor\s+literal 1/i],
  ];

  for (const [concept, pattern] of documentedConcepts) {
    assert.match(
      description ?? "",
      pattern,
      `${concept} ausente en ${context}`,
    );
  }
};

test("declara x-admin-intent como indicador fijo y elimina la clave legacy", () => {
  const schemes = contract.components?.securitySchemes;
  assert.equal(schemes?.adminIntent?.type, "apiKey");
  assert.equal(schemes?.adminIntent?.in, "header");
  assert.equal(schemes?.adminIntent?.name, "x-admin-intent");
  assert.match(schemes?.adminIntent?.description ?? "", /no secreto/i);
  assert.match(schemes?.adminIntent?.description ?? "", /valor literal 1/i);
  assert.equal(schemes?.adminApiKey, undefined);
  assert.doesNotMatch(source, /adminApiKey|x-admin-key/i);
});

test("las doce operaciones administrativas incondicionales exigen cookie e intencion", () => {
  const expectedSecurity = [{ sessionCookie: [], adminIntent: [] }];

  for (const [path, method] of unconditionalAdminOperations) {
    assert.deepEqual(operationAt(path, method).security, expectedSecurity);
  }

  const operationsWithIntent = [];
  for (const [path, pathItem] of Object.entries(contract.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (
        Array.isArray(operation?.security) &&
        operation.security.some((requirement) =>
          Object.hasOwn(requirement, "adminIntent"),
        )
      ) {
        operationsWithIntent.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  assert.deepEqual(
    operationsWithIntent.sort(),
    unconditionalAdminOperations
      .map(([path, method]) => `${method.toUpperCase()} ${path}`)
      .sort(),
  );
});

test("las cinco fronteras condicionales conservan la sesion sin exigir intencion global", () => {
  assert.deepEqual(contract.security, [{ sessionCookie: [] }]);

  for (const [path, method] of conditionalAdminOperations) {
    const operation = operationAt(path, method);
    const effectiveSecurity = operation.security ?? contract.security;
    assert.deepEqual(effectiveSecurity, [{ sessionCookie: [] }]);

    const includeEmptyParameter = operation.parameters?.find(
      (parameter) => parameter.name === "incluir_vacios",
    );
    assert.ok(
      includeEmptyParameter,
      `Falta incluir_vacios en ${method.toUpperCase()} ${path}`,
    );
    assert.equal(includeEmptyParameter.in, "query");
    assert.equal(includeEmptyParameter.schema?.type, "boolean");
    assert.equal(includeEmptyParameter.schema?.default, false);
    assertDocumentsAdminElevation(
      includeEmptyParameter.description,
      `incluir_vacios de ${method.toUpperCase()} ${path}`,
    );
  }
});

test("consultar, crear y revocar elevacion solo exige la cookie de sesion", () => {
  for (const [path, method] of elevationOperations) {
    assert.deepEqual(operationAt(path, method).security, [
      { sessionCookie: [] },
    ]);
  }
});

test("todas las fronteras administrativas tipan 401, 403 y 503", () => {
  for (const [path, method] of [
    ...unconditionalAdminOperations,
    ...conditionalAdminOperations,
  ]) {
    const operation = operationAt(path, method);
    assert.equal(
      responseSchemaRef(operation, "401"),
      "#/components/schemas/AdminAccessUnauthorized",
      `401 incompleto en ${method.toUpperCase()} ${path}`,
    );
    assert.equal(
      responseSchemaRef(operation, "503"),
      "#/components/schemas/AdminElevationUnavailableError",
      `503 incompleto en ${method.toUpperCase()} ${path}`,
    );
    assert.equal(
      operation.responses?.["403"]?.$ref,
      "#/components/responses/FunctionalAccessForbidden",
      `403 incompleto en ${method.toUpperCase()} ${path}`,
    );
  }
});

test("PATCH tecnico y DELETE documentan la elevacion sin prometer una clave por header", () => {
  const updateOperation = operationAt("/tickets/{id}", "patch");
  assert.match(updateOperation.description ?? "", /campos técnicos/i);
  assertDocumentsAdminElevation(
    updateOperation.description,
    "PATCH /tickets/{id}",
  );

  const deleteOperation = operationAt("/tickets/{id}", "delete");
  assert.match(deleteOperation.summary ?? "", /elevacion administrativa/i);
  assert.doesNotMatch(deleteOperation.summary ?? "", /clave/i);
  assertDocumentsAdminElevation(
    deleteOperation.description,
    "DELETE /tickets/{id}",
  );
});

test("los errores estables representan sesion, elevacion, disponibilidad y rol", () => {
  const schemas = contract.components?.schemas;
  assert.deepEqual(schemas?.AdminElevationRequiredError?.required, [
    "code",
    "error",
  ]);
  assert.deepEqual(
    schemas?.AdminElevationRequiredError?.properties?.code?.enum,
    ["ADMIN_ELEVATION_REQUIRED"],
  );
  assert.deepEqual(schemas?.AdminAccessUnauthorized?.oneOf, [
    {
      $ref: "#/components/schemas/AdminElevationSessionUnauthorizedError",
    },
    { $ref: "#/components/schemas/AdminElevationRequiredError" },
  ]);
  assert.deepEqual(
    schemas?.AdminElevationUnavailableError?.properties?.code?.enum,
    ["ADMIN_ELEVATION_UNAVAILABLE"],
  );
  assert.deepEqual(schemas?.FunctionalAccessError?.properties?.code?.enum, [
    "PASSWORD_CHANGE_REQUIRED",
    "SYSADMIN_REQUIRED",
  ]);
  assert.match(
    schemas?.FunctionalAccessError?.properties?.code?.description ?? "",
    /frontera funcional/i,
  );
});
