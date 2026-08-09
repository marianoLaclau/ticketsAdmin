import { Router } from "express";
import { db, sesionesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getSessionUser,
  requirePasswordChangeCompleted,
  requireSession,
  requireSysAdmin,
} from "../lib/auth";
import {
  clearSessionCookie,
  getSessionToken,
  hashSessionToken,
  hasSessionCookie,
} from "../lib/session-cookie";
import { closeEventClientsForSessionHash } from "../lib/events";
import { loginUser } from "./auth-login-handler";
import { changeOwnPassword } from "./auth-password-handler";
import {
  createAdminElevation,
  deleteAdminElevation,
  getAdminElevation,
} from "./auth-admin-elevation-handler";

const router = Router();

router.use("/auth", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/auth/login", loginUser);

router.post("/auth/password", changeOwnPassword);

router.use(
  "/auth/admin-elevation",
  requireSession,
  requirePasswordChangeCompleted,
  requireSysAdmin,
);
router.get("/auth/admin-elevation", getAdminElevation);
router.post("/auth/admin-elevation", createAdminElevation);
router.delete("/auth/admin-elevation", deleteAdminElevation);

router.post("/auth/logout", async (req, res) => {
  const token = getSessionToken(req);
  if (token) {
    const tokenHash = hashSessionToken(token);
    await db
      .delete(sesionesTable)
      .where(eq(sesionesTable.token_hash, tokenHash));
    closeEventClientsForSessionHash(tokenHash);
  }
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/auth/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    if (hasSessionCookie(req)) clearSessionCookie(res);
    res.status(401).json({ error: "Sin sesión válida" });
    return;
  }
  res.json(user);
});

export default router;
