import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joinBasePath } from "../src/lib/base-path.ts";

describe("rutas bajo el base path de la aplicación", () => {
  it("conserva la raíz y evita barras duplicadas", () => {
    assert.equal(joinBasePath("/", "/dashboard"), "/dashboard");
    assert.equal(joinBasePath("/", "admin"), "/admin");
  });

  it("agrega la barra ausente al base path", () => {
    assert.equal(
      joinBasePath("/ticket-manager", "/admin"),
      "/ticket-manager/admin",
    );
  });

  it("preserva un base path ya normalizado", () => {
    assert.equal(
      joinBasePath("/ticket-manager/", "dashboard"),
      "/ticket-manager/dashboard",
    );
    assert.equal(joinBasePath("/ticket-manager/"), "/ticket-manager/");
  });
});
