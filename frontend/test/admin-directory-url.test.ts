import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_DIRECTORY_TABS,
  createDefaultAdminDirectoryUrlState,
  parseAdminDirectoryUrlState,
  serializeAdminDirectoryUrlState,
  type AdminDirectoryUrlState,
} from "../src/lib/admin-directory-url.ts";

describe("codec URL del directorio administrativo", () => {
  it("omite la pestaña Usuarios predeterminada", () => {
    const state = createDefaultAdminDirectoryUrlState();

    assert.deepEqual(state, { tab: "users" });
    assert.deepEqual(parseAdminDirectoryUrlState(""), state);
    assert.deepEqual(parseAdminDirectoryUrlState("tab=users"), state);
    assert.equal(serializeAdminDirectoryUrlState(state).toString(), "");
  });

  it("declara, congela y conserva todas las pestañas", () => {
    assert.deepEqual(ADMIN_DIRECTORY_TABS, ["users", "roles"]);
    assert.equal(Object.isFrozen(ADMIN_DIRECTORY_TABS), true);

    for (const tab of ADMIN_DIRECTORY_TABS) {
      const state: AdminDirectoryUrlState = { tab };
      const serialized = serializeAdminDirectoryUrlState(state);

      assert.deepEqual(parseAdminDirectoryUrlState(serialized), state);
      assert.equal(serialized.get("tab"), tab === "users" ? null : tab);
    }
  });

  it("canoniza duplicados conservando solamente el primer valor", () => {
    const parsed = parseAdminDirectoryUrlState(
      "tab=roles&tab=users&utm_source=prueba",
    );

    assert.deepEqual(parsed, { tab: "roles" });
    assert.equal(
      serializeAdminDirectoryUrlState(parsed).toString(),
      "tab=roles",
    );
  });

  it("descarta valores inválidos y todos los parámetros ajenos", () => {
    const parsed = parseAdminDirectoryUrlState(
      "tab=permisos&search=Ana&page=3&admin_api_key=no-debe-sobrevivir",
    );

    assert.deepEqual(parsed, createDefaultAdminDirectoryUrlState());
    assert.equal(serializeAdminDirectoryUrlState(parsed).toString(), "");

    const roles = parseAdminDirectoryUrlState(
      "tab=roles&search=Ana&page=3&limit=25",
    );
    assert.equal(
      serializeAdminDirectoryUrlState(roles).toString(),
      "tab=roles",
    );
  });

  it("sanea estados inválidos y nunca serializa propiedades ajenas", () => {
    for (const unsafeState of [null, [], {}, { tab: "permisos" }]) {
      assert.equal(
        serializeAdminDirectoryUrlState(
          unsafeState as unknown as AdminDirectoryUrlState,
        ).toString(),
        "",
      );
    }

    assert.equal(
      serializeAdminDirectoryUrlState({
        tab: "roles",
        search: "Ana",
        admin_api_key: "no-debe-sobrevivir",
      } as unknown as AdminDirectoryUrlState).toString(),
      "tab=roles",
    );
  });

  it("rechaza propiedades heredadas, getters hostiles y proxies revocados", () => {
    const inheritedState = Object.create({ tab: "roles" }) as unknown;
    const hostileState = Object.defineProperty({}, "tab", {
      get(): never {
        throw new Error("getter hostil");
      },
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    for (const unsafeState of [inheritedState, hostileState, revoked.proxy]) {
      assert.equal(
        serializeAdminDirectoryUrlState(
          unsafeState as unknown as AdminDirectoryUrlState,
        ).toString(),
        "",
      );
    }
  });

  it("lee una sola vez la propiedad validada", () => {
    let tabReads = 0;
    const changingState = {
      get tab(): string {
        tabReads += 1;
        return tabReads === 1 ? "roles" : "users";
      },
    };

    assert.equal(
      serializeAdminDirectoryUrlState(
        changingState as unknown as AdminDirectoryUrlState,
      ).toString(),
      "tab=roles",
    );
    assert.equal(tabReads, 1);
  });
});
