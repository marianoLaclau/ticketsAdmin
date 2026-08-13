import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  requirePerformanceAccess,
  requireTicketWriteAccess,
} from "../src/lib/auth.ts";
import {
  CAPACIDAD_ADMINISTRAR,
  CAPACIDAD_CERRAR_TICKETS,
  CAPACIDAD_GESTIONAR_TICKETS,
  CAPACIDAD_VER_DASHBOARD,
  CAPACIDAD_VER_RENDIMIENTO,
  CAPACIDAD_VER_TICKETS,
  ROL_ADMINISTRADOR,
  ROL_CONTROLLER,
  ROL_OPERADOR,
  ROL_SYSADMIN,
  ROLES_SISTEMA,
  esNombreRolReservado,
  esRolSistema,
  tieneCapacidad,
} from "../src/lib/rbac.ts";

const TODAS_LAS_CAPACIDADES = [
  CAPACIDAD_VER_DASHBOARD,
  CAPACIDAD_VER_TICKETS,
  CAPACIDAD_GESTIONAR_TICKETS,
  CAPACIDAD_CERRAR_TICKETS,
  CAPACIDAD_VER_RENDIMIENTO,
  CAPACIDAD_ADMINISTRAR,
] as const;

function capacidadesDe(rol: string | undefined): string[] {
  return TODAS_LAS_CAPACIDADES.filter((capacidad) =>
    tieneCapacidad(rol, capacidad),
  );
}

function ejecutarMiddleware(
  middleware: RequestHandler,
  rol: string | undefined,
): { status: number; payload: unknown; nextCalled: boolean } {
  let status = 200;
  let payload: unknown;
  let nextCalled = false;
  const response = {
    locals: rol
      ? {
          authUser: {
            id: 1,
            nombre: "Usuario",
            apellido: null,
            email: "usuario@example.test",
            rol,
            debe_cambiar_password: false,
          },
        }
      : {},
    status(code: number) {
      status = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    },
  } as unknown as Response;

  middleware({} as Request, response, (() => {
    nextCalled = true;
  }) as NextFunction);

  return { status, payload, nextCalled };
}

describe("capacidades RBAC canónicas", () => {
  it("define el alcance completo de cada rol del sistema", () => {
    assert.deepEqual(capacidadesDe(ROL_SYSADMIN), [
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_GESTIONAR_TICKETS,
      CAPACIDAD_CERRAR_TICKETS,
      CAPACIDAD_VER_RENDIMIENTO,
      CAPACIDAD_ADMINISTRAR,
    ]);
    assert.deepEqual(capacidadesDe(ROL_CONTROLLER), [
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_VER_RENDIMIENTO,
    ]);
    assert.deepEqual(capacidadesDe(ROL_ADMINISTRADOR), [
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_GESTIONAR_TICKETS,
      CAPACIDAD_CERRAR_TICKETS,
    ]);
    assert.deepEqual(capacidadesDe(ROL_OPERADOR), [
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_GESTIONAR_TICKETS,
    ]);
  });

  it("conserva la gestión básica de roles personalizados y falla cerrado sin rol", () => {
    assert.deepEqual(capacidadesDe("Mesa personalizada"), [
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_GESTIONAR_TICKETS,
    ]);
    assert.deepEqual(capacidadesDe(undefined), []);
    assert.deepEqual(capacidadesDe("toString"), [
      CAPACIDAD_VER_DASHBOARD,
      CAPACIDAD_VER_TICKETS,
      CAPACIDAD_GESTIONAR_TICKETS,
    ]);
  });

  it("incorpora Controller a las identidades protegidas y reserva su nombre", () => {
    assert.deepEqual(ROLES_SISTEMA, [
      ROL_SYSADMIN,
      ROL_CONTROLLER,
      ROL_ADMINISTRADOR,
      ROL_OPERADOR,
    ]);
    assert.equal(esRolSistema(ROL_CONTROLLER), true);
    assert.equal(esNombreRolReservado(" controller "), true);
    assert.equal(esNombreRolReservado("CoNtRoLlEr"), true);
  });
});

describe("middlewares de capacidades", () => {
  it("habilita Rendimiento solo para SysAdmin y Controller", () => {
    for (const rol of [ROL_SYSADMIN, ROL_CONTROLLER]) {
      assert.deepEqual(ejecutarMiddleware(requirePerformanceAccess, rol), {
        status: 200,
        payload: undefined,
        nextCalled: true,
      });
    }

    for (const rol of [
      ROL_ADMINISTRADOR,
      ROL_OPERADOR,
      "Mesa personalizada",
      undefined,
    ]) {
      assert.deepEqual(ejecutarMiddleware(requirePerformanceAccess, rol), {
        status: 403,
        payload: {
          code: "PERFORMANCE_ACCESS_REQUIRED",
          error: "Requiere rol SysAdmin o Controller",
        },
        nextCalled: false,
      });
    }
  });

  it("bloquea escritura de tickets a Controller y a contextos incompletos", () => {
    for (const rol of [
      ROL_SYSADMIN,
      ROL_ADMINISTRADOR,
      ROL_OPERADOR,
      "Mesa personalizada",
    ]) {
      assert.equal(
        ejecutarMiddleware(requireTicketWriteAccess, rol).nextCalled,
        true,
      );
    }

    for (const rol of [ROL_CONTROLLER, undefined]) {
      assert.deepEqual(ejecutarMiddleware(requireTicketWriteAccess, rol), {
        status: 403,
        payload: {
          code: "TICKET_WRITE_FORBIDDEN",
          error: "El rol actual solo puede consultar tickets",
        },
        nextCalled: false,
      });
    }
  });
});
