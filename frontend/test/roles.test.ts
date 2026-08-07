import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  esNombreRolReservado,
  esRolSistema,
  puedeCerrarTickets,
  ROL_ADMINISTRADOR,
  ROL_OPERADOR,
  ROL_SYSADMIN,
} from "../src/lib/roles.ts";

describe("política de roles del frontend", () => {
  it("reconoce los nombres reservados sin distinguir espacios o mayúsculas", () => {
    for (const rol of [ROL_SYSADMIN, ROL_ADMINISTRADOR, ROL_OPERADOR]) {
      assert.equal(esNombreRolReservado(rol), true);
      assert.equal(
        esNombreRolReservado(`  ${rol.toLocaleUpperCase("es")}  `),
        true,
      );
    }
    assert.equal(esNombreRolReservado("Mesa personalizada"), false);
  });

  it("protege únicamente las identidades canónicas realmente autorizadas", () => {
    assert.equal(esRolSistema(ROL_SYSADMIN), true);
    assert.equal(esRolSistema(ROL_ADMINISTRADOR), true);
    assert.equal(esRolSistema(ROL_OPERADOR), true);
    assert.equal(esRolSistema("sysadmin"), false);
  });

  it("mantiene la capacidad de cierre de los roles previstos", () => {
    assert.equal(puedeCerrarTickets(ROL_SYSADMIN), true);
    assert.equal(puedeCerrarTickets(ROL_ADMINISTRADOR), true);
    assert.equal(puedeCerrarTickets(ROL_OPERADOR), false);
  });
});
