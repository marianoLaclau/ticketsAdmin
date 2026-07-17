import { Router, type Request } from "express";
import { randomBytes } from "node:crypto";
import { db, sesionesTable, usuariosTable, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { verifyPassword } from "../lib/passwords";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  getSessionUser,
  purgeExpiredSessions,
} from "../lib/auth";

const router = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

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
    })
    .from(usuariosTable)
    .innerJoin(rolesTable, eq(usuariosTable.role_id, rolesTable.id))
    .where(eq(usuariosTable.username, usuarioNormalizado));

  // Mensaje genérico a propósito: no revelar si el usuario existe o no
  if (!user || !user.activo || !verifyPassword(parsed.data.password, user.password_hash)) {
    res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    return;
  }

  await purgeExpiredSessions();

  const token = randomBytes(32).toString("hex");
  await db.insert(sesionesTable).values({
    token,
    usuario_id: user.id,
    fecha_expiracion: new Date(Date.now() + SESSION_TTL_MS),
  });

  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
  res.json({
    id: user.id,
    nombre: user.nombre,
    apellido: user.apellido,
    email: user.email,
    rol: user.rol,
  });
});

router.post("/auth/logout", async (req, res) => {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (token) {
    await db.delete(sesionesTable).where(eq(sesionesTable.token, token));
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
