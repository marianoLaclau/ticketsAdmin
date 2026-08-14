import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_DIRECTORY_TABS,
  ADMIN_DIRECTORY_ROLE_STATUSES,
  ADMIN_DIRECTORY_USER_LIMITS,
  ADMIN_DIRECTORY_USER_STATUSES,
  createDefaultAdminDirectoryUrlState,
  parseAdminDirectoryUrlState,
  serializeAdminDirectoryUrlState,
  type AdminDirectoryUrlState,
} from "../src/features/admin-directory/admin-directory-url.ts";

describe("codec URL del directorio administrativo", () => {
  it("omite por completo el estado predeterminado", () => {
    const state = createDefaultAdminDirectoryUrlState();

    assert.deepEqual(state, {
      tab: "users",
      users: { page: 1, limit: 10 },
      roles: {},
    });
    assert.deepEqual(parseAdminDirectoryUrlState(""), state);
    assert.deepEqual(
      parseAdminDirectoryUrlState("tab=users&user_page=1&user_limit=10"),
      state,
    );
    assert.equal(serializeAdminDirectoryUrlState(state).toString(), "");
  });

  it("declara y congela pestañas, estados compartidos y límites", () => {
    assert.deepEqual(ADMIN_DIRECTORY_TABS, ["users", "roles"]);
    assert.deepEqual(ADMIN_DIRECTORY_USER_STATUSES, ["active", "inactive"]);
    assert.deepEqual(ADMIN_DIRECTORY_ROLE_STATUSES, ["active", "inactive"]);
    assert.deepEqual(ADMIN_DIRECTORY_USER_LIMITS, [10, 25, 50, 100]);
    assert.equal(Object.isFrozen(ADMIN_DIRECTORY_TABS), true);
    assert.equal(Object.isFrozen(ADMIN_DIRECTORY_USER_STATUSES), true);
    assert.equal(Object.isFrozen(ADMIN_DIRECTORY_ROLE_STATUSES), true);
    assert.equal(ADMIN_DIRECTORY_ROLE_STATUSES, ADMIN_DIRECTORY_USER_STATUSES);
    assert.equal(Object.isFrozen(ADMIN_DIRECTORY_USER_LIMITS), true);

    for (const tab of ADMIN_DIRECTORY_TABS) {
      const state = { ...createDefaultAdminDirectoryUrlState(), tab };
      const serialized = serializeAdminDirectoryUrlState(state);

      assert.deepEqual(parseAdminDirectoryUrlState(serialized), state);
      assert.equal(serialized.get("tab"), tab === "users" ? null : tab);
    }
  });

  it("conserva todos los campos en orden determinista", () => {
    const state: AdminDirectoryUrlState = {
      tab: "roles",
      users: {
        search: "  Ana Pérez  ",
        roleId: 42,
        status: "inactive",
        page: 3,
        limit: 25,
      },
      roles: {
        search: "  Finanzas  ",
        status: "active",
      },
    };

    const serialized = serializeAdminDirectoryUrlState(state);

    assert.equal(
      serialized.toString(),
      "tab=roles&user_search=++Ana+P%C3%A9rez++&user_role=42&user_status=inactive&user_page=3&user_limit=25&role_search=++Finanzas++&role_status=active",
    );
    assert.deepEqual(parseAdminDirectoryUrlState(serialized), state);
  });

  it("canoniza duplicados conservando solamente el primer valor", () => {
    const parsed = parseAdminDirectoryUrlState(
      "tab=roles&tab=users&user_search=primera&user_search=segunda" +
        "&user_role=2&user_role=3&user_status=active&user_status=inactive" +
        "&user_page=4&user_page=7&user_limit=50&user_limit=100" +
        "&role_search=Legal&role_search=Finanzas" +
        "&role_status=inactive&role_status=active",
    );

    assert.deepEqual(parsed, {
      tab: "roles",
      users: {
        search: "primera",
        roleId: 2,
        status: "active",
        page: 4,
        limit: 50,
      },
      roles: {
        search: "Legal",
        status: "inactive",
      },
    });
    assert.equal(
      serializeAdminDirectoryUrlState(parsed).toString(),
      "tab=roles&user_search=primera&user_role=2&user_status=active&user_page=4&user_limit=50&role_search=Legal&role_status=inactive",
    );
  });

  it("descarta valores inválidos, texto vacío y parámetros ajenos", () => {
    const parsed = parseAdminDirectoryUrlState(
      "tab=permisos&user_search=+++&user_role=0&user_status=disabled" +
        "&user_page=-2&user_limit=20&role_search=+++&role_status=disabled" +
        "&roles_search=Gerencia" +
        "&admin_api_key=no-debe-sobrevivir",
    );

    assert.deepEqual(parsed, createDefaultAdminDirectoryUrlState());
    assert.equal(serializeAdminDirectoryUrlState(parsed).toString(), "");
  });

  it("admite sólo roles enteros positivos seguros", () => {
    assert.equal(
      parseAdminDirectoryUrlState(`user_role=${Number.MAX_SAFE_INTEGER}`).users
        .roleId,
      Number.MAX_SAFE_INTEGER,
    );

    for (const role of [
      "-1",
      "0",
      "1.5",
      "01",
      "2x",
      String(Number.MAX_SAFE_INTEGER + 1),
    ]) {
      assert.equal(
        parseAdminDirectoryUrlState(`user_role=${role}`).users.roleId,
        undefined,
      );
    }
  });

  it("valida la página segura respecto del límite efectivo", () => {
    const maxSafePageForLimit100 =
      Math.floor(Number.MAX_SAFE_INTEGER / 100) + 1;

    assert.equal(
      parseAdminDirectoryUrlState(
        `user_page=${maxSafePageForLimit100}&user_limit=100`,
      ).users.page,
      maxSafePageForLimit100,
    );
    assert.equal(
      parseAdminDirectoryUrlState(
        `user_page=${maxSafePageForLimit100 + 1}&user_limit=100`,
      ).users.page,
      1,
    );

    for (const limit of ADMIN_DIRECTORY_USER_LIMITS) {
      assert.equal(
        parseAdminDirectoryUrlState(`user_limit=${limit}`).users.limit,
        limit,
      );
    }
    for (const limit of ["0", "20", "101", "10.0"]) {
      assert.equal(
        parseAdminDirectoryUrlState(`user_limit=${limit}`).users.limit,
        10,
      );
    }
  });

  it("sanea estados inválidos y nunca serializa propiedades ajenas", () => {
    for (const unsafeState of [
      null,
      [],
      {},
      { tab: "permisos" },
      {
        tab: "users",
        users: {
          search: "   ",
          roleId: 0,
          status: "disabled",
          page: Number.POSITIVE_INFINITY,
          limit: 20,
        },
        roles: {
          search: "   ",
          status: "disabled",
        },
      },
    ]) {
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
        users: { page: 2, limit: 25 },
        roles: {
          search: "  Legal  ",
          status: "active",
          page: 9,
        },
        roles_search: "Gerencia",
        admin_api_key: "no-debe-sobrevivir",
      } as unknown as AdminDirectoryUrlState).toString(),
      "tab=roles&user_page=2&user_limit=25&role_search=++Legal++&role_status=active",
    );
  });

  it("rechaza propiedades heredadas y objetos hostiles o revocados", () => {
    const inheritedState = Object.create({
      tab: "roles",
      users: { page: 3, limit: 25 },
      roles: { search: "Legal", status: "active" },
    }) as unknown;
    const hostileState = Object.defineProperty({}, "tab", {
      get(): never {
        throw new Error("getter hostil");
      },
    });
    const revokedState = Proxy.revocable({}, {});
    revokedState.revoke();
    const inheritedUsers = Object.create({
      search: "Ana",
      roleId: 2,
      status: "active",
      page: 3,
      limit: 25,
    });
    const inheritedRoles = Object.create({
      search: "Legal",
      status: "active",
    });
    const hostileUsers = Object.defineProperty({}, "search", {
      get(): never {
        throw new Error("getter hostil");
      },
    });
    const revokedUsers = Proxy.revocable({}, {});
    revokedUsers.revoke();
    const hostileRoles = Object.defineProperty({}, "status", {
      get(): never {
        throw new Error("getter hostil");
      },
    });
    const revokedRoles = Proxy.revocable({}, {});
    revokedRoles.revoke();

    for (const state of [inheritedState, hostileState, revokedState.proxy]) {
      assert.equal(
        serializeAdminDirectoryUrlState(
          state as unknown as AdminDirectoryUrlState,
        ).toString(),
        "",
      );
    }
    assert.equal(
      serializeAdminDirectoryUrlState({
        tab: "roles",
        users: inheritedUsers,
        roles: { search: "Legal", status: "active" },
      } as AdminDirectoryUrlState).toString(),
      "tab=roles&role_search=Legal&role_status=active",
    );
    assert.equal(
      serializeAdminDirectoryUrlState({
        tab: "roles",
        users: { page: 1, limit: 10 },
        roles: inheritedRoles,
      } as AdminDirectoryUrlState).toString(),
      "tab=roles",
    );

    for (const users of [hostileUsers, revokedUsers.proxy]) {
      assert.equal(
        serializeAdminDirectoryUrlState({
          tab: "roles",
          users,
          roles: { search: "Legal" },
        } as unknown as AdminDirectoryUrlState).toString(),
        "",
      );
    }

    for (const roles of [hostileRoles, revokedRoles.proxy]) {
      assert.equal(
        serializeAdminDirectoryUrlState({
          tab: "roles",
          users: { page: 2, limit: 25 },
          roles,
        } as unknown as AdminDirectoryUrlState).toString(),
        "",
      );
    }
  });

  it("lee una sola vez cada propiedad validada, incluidos users y roles", () => {
    const reads = {
      tab: 0,
      users: 0,
      roles: 0,
      userSearch: 0,
      roleId: 0,
      userStatus: 0,
      page: 0,
      limit: 0,
      roleSearch: 0,
      roleStatus: 0,
    };
    const changingUsers = {
      get search(): string {
        reads.userSearch += 1;
        return reads.userSearch === 1 ? "Ana" : "otra";
      },
      get roleId(): number {
        reads.roleId += 1;
        return reads.roleId === 1 ? 2 : 9;
      },
      get status(): string {
        reads.userStatus += 1;
        return reads.userStatus === 1 ? "active" : "inactive";
      },
      get page(): number {
        reads.page += 1;
        return reads.page === 1 ? 3 : 8;
      },
      get limit(): number {
        reads.limit += 1;
        return reads.limit === 1 ? 25 : 100;
      },
    };
    const changingRoles = {
      get search(): string {
        reads.roleSearch += 1;
        return reads.roleSearch === 1 ? "Legal" : "otra";
      },
      get status(): string {
        reads.roleStatus += 1;
        return reads.roleStatus === 1 ? "inactive" : "active";
      },
    };
    const changingState = {
      get tab(): string {
        reads.tab += 1;
        return reads.tab === 1 ? "roles" : "users";
      },
      get users(): unknown {
        reads.users += 1;
        return reads.users === 1 ? changingUsers : {};
      },
      get roles(): unknown {
        reads.roles += 1;
        return reads.roles === 1 ? changingRoles : {};
      },
    };

    assert.equal(
      serializeAdminDirectoryUrlState(
        changingState as unknown as AdminDirectoryUrlState,
      ).toString(),
      "tab=roles&user_search=Ana&user_role=2&user_status=active&user_page=3&user_limit=25&role_search=Legal&role_status=inactive",
    );
    assert.deepEqual(reads, {
      tab: 1,
      users: 1,
      roles: 1,
      userSearch: 1,
      roleId: 1,
      userStatus: 1,
      page: 1,
      limit: 1,
      roleSearch: 1,
      roleStatus: 1,
    });
  });
});
