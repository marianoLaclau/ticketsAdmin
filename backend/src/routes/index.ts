import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ticketsRouter from "./tickets";
import dashboardRouter from "./dashboard";
import webhooksRouter from "./webhooks";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ticketsRouter);
router.use(dashboardRouter);
router.use(webhooksRouter);
router.use(adminRouter);

export default router;
