import { Router, type Request } from "express";
import { randomBytes } from "node:crypto";
import { db, sesionesTable, usuariosTable, rolesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import {
  hashPassword,
  needsPasswordRehash,
  verifyPasswordOrDummy,
} from "../lib/passwords";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  getSessionUser,
  purgeExpiredSessions,
} from "../lib/auth";
import { closeEventClientsForSession } from "../lib/events";

const router = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

interface LoginUserRecord {
  id: number;
  nombre: string;
  apellido: string | null;
  email: string;
  password_hash: string;
  activo: boolean;
  rol: string;
  rol_activo: boolean;
}

type LoginTransactionResult =
  | { kind: "authenticated"; user: LoginUserRecord }
  | { kind: "hash_changed"; user: LoginUserRecord }
  | { kind: "invalid" };

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const usuarioNormalizado = parsed.data.usuario.trim().toLowerCase();

  const [user] = await db
    .select({
      id: usuariosTable.id,
      nombre: usuariosTable.nombre,
      apellido: usuariosTable.apellido,
      email: usuariosTable.email,
      password_hash: usuariosTable.password_hash,
      activo: usuariosTable.activo,
      rol: rolesTable.nombre,
      rol_activo: rolesTable.activo,
    })
    .from(usuariosTable)
    .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
    .where(eq(usuariosTable.username, usuarioNormalizado));

  // Se ejecuta un scrypt también para usuarios inexistentes o hashes rotos.
  // Además del mensaje genérico, esto evita enumeración por tiempo de respuesta.
  const passwordValida = await verifyPasswordOrDummy(
    parsed.data.password,
    user?.password_hash ?? null,
  );
  if (
    !user ||
    !user.password_hash ||
    !user.activo ||
    !user.rol_activo ||
    !passwordValida
  ) {
    res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    return;
  }

  await purgeExpiredSessions();

  const token = randomBytes(32).toString("hex");
  let candidate: LoginUserRecord = {
    ...user,
    password_hash: user.password_hash,
  };
  let authenticatedUser: LoginUserRecord | null = null;

  // Dos logins pueden verificar a la vez el mismo hash legado. El primero lo
  // migra; el segundo vuelve a verificar una sola vez el hash nuevo en lugar
  // de rechazar una contraseña que sigue siendo válida. El límite evita un
  // bucle si un administrador está rotando la credencial en paralelo.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const passwordRehasheada = needsPasswordRehash(candidate.password_hash)
      ? await hashPassword(parsed.data.password)
      : null;
    const result = db.transaction((tx): LoginTransactionResult => {
      // El KDF ocurre fuera de la transacción. Antes de emitir la sesión se
      // relee el estado y se exige el mismo hash, evitando que un reset
      // concurrente termine autenticando la contraseña anterior.
      const current = tx
        .select({
          id: usuariosTable.id,
          nombre: usuariosTable.nombre,
          apellido: usuariosTable.apellido,
          email: usuariosTable.email,
          password_hash: usuariosTable.password_hash,
          activo: usuariosTable.activo,
          rol: rolesTable.nombre,
          rol_activo: rolesTable.activo,
        })
        .from(usuariosTable)
        .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
        .where(eq(usuariosTable.id, candidate.id))
        .get();
      if (
        !current ||
        !current.password_hash ||
        !current.activo ||
        !current.rol_activo
      ) {
        return { kind: "invalid" };
      }

      const stableCurrent: LoginUserRecord = {
        ...current,
        password_hash: current.password_hash,
      };
      if (stableCurrent.password_hash !== candidate.password_hash) {
        return { kind: "hash_changed", user: stableCurrent };
      }

      if (passwordRehasheada) {
        const update = tx
          .update(usuariosTable)
          .set({
            password_hash: passwordRehasheada,
            fecha_actualizacion: new Date(),
          })
          .where(
            and(
              eq(usuariosTable.id, stableCurrent.id),
              eq(usuariosTable.password_hash, candidate.password_hash),
            ),
          )
          .run();
        if (update.changes !== 1) {
          return { kind: "invalid" };
        }
      }
      tx.insert(sesionesTable)
        .values({
          token,
          usuario_id: stableCurrent.id,
          fecha_expiracion: new Date(Date.now() + SESSION_TTL_MS),
        })
        .run();
      return { kind: "authenticated", user: stableCurrent };
    });

    if (result.kind === "authenticated") {
      authenticatedUser = result.user;
      break;
    }
    if (result.kind === "invalid" || attempt > 0) break;

    const passwordSigueSiendoValida = await verifyPasswordOrDummy(
      parsed.data.password,
      result.user.password_hash,
    );
    if (!passwordSigueSiendoValida) break;
    candidate = result.user;
  }

  if (!authenticatedUser) {
    res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    return;
  }

  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: SESSION_TTL_MS,
  });
  res.json({
    id: authenticatedUser.id,
    nombre: authenticatedUser.nombre,
    apellido: authenticatedUser.apellido,
    email: authenticatedUser.email,
    rol: authenticatedUser.rol,
  });
});

router.post("/auth/logout", async (req, res) => {
  const token = (req as Request & { cookies?: Record<string, string> })
    .cookies?.[SESSION_COOKIE];
  if (token) {
    await db.delete(sesionesTable).where(eq(sesionesTable.token, token));
    closeEventClientsForSession(token);
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
});

router.get("/auth/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Sin sesión válida" });
    return;
  }
  res.json(user);
});

export default router;
