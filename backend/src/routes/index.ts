import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ticketsRouter from "./tickets";
import dashboardRouter from "./dashboard";
import webhooksRouter from "./webhooks";
import adminRouter from "./admin";
import eventsRouter from "./events";
import authRouter from "./auth";
import { requireSession } from "../lib/auth";

const router: IRouter = Router();

// Rutas públicas o con clave propia
router.use(healthRouter);      // healthz: chequeo de vida
router.use(webhooksRouter);    // n8n: autenticado por x-api-key
router.use(authRouter);        // login / logout / me

// Candado global: TODO lo que sigue exige sesión iniciada
router.use(requireSession);
router.use(ticketsRouter);
router.use(dashboardRouter);
router.use(adminRouter);       // además exige x-admin-key (doble verificación)
router.use(eventsRouter);

export default router;
