import { Router, type IRouter } from "express";
import {
  HealthCheckResponse,
  ReadinessCheckResponse,
} from "@workspace/api-zod";
import { readinessControl } from "../shared/runtime/runtime-readiness";

interface HealthRouterOptions {
  isReady: () => boolean;
  reportFailure?: (error: unknown) => void;
}

export function createHealthRouter({
  isReady,
  reportFailure = () => undefined,
}: HealthRouterOptions): IRouter {
  const router: IRouter = Router();

  router.get("/healthz", (_req, res) => {
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.set("Cache-Control", "no-store").json(data);
  });

  router.get("/readyz", (_req, res) => {
    let ready = false;
    try {
      ready = isReady();
    } catch (error) {
      reportFailure(error);
    }

    if (!ready) {
      return res
        .status(503)
        .set("Cache-Control", "no-store")
        .json({ status: "unavailable" });
    }

    const data = ReadinessCheckResponse.parse({ status: "ready" });
    return res.set("Cache-Control", "no-store").json(data);
  });

  return router;
}

const router = createHealthRouter({
  isReady: () => readinessControl.isReady(),
});

export default router;
