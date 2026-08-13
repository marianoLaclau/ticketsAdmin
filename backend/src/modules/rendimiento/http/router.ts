import { Router, type IRouter } from "express";
import { GetRendimientoStatusResponse } from "@workspace/api-zod";
import { requirePerformanceAccess } from "../../auth";
import {
  createRendimientoQualityHandler,
  type RendimientoQualityHandlerOptions,
} from "./quality-handler";
import {
  createRendimientoTeamSummaryHandler,
  type RendimientoTeamSummaryHandlerOptions,
} from "./team-summary-handler";
import {
  createRendimientoIndividualHandler,
  type RendimientoIndividualHandlerOptions,
} from "./individual-handler";
import {
  createRendimientoRepetitionHandler,
  type RendimientoRepetitionHandlerOptions,
} from "./repetition-handler";
import {
  createRendimientoChatProxyHandler,
  type RendimientoChatProxyHandlerOptions,
} from "./chat-proxy-handler";

export type RendimientoRouterOptions = RendimientoQualityHandlerOptions &
  RendimientoTeamSummaryHandlerOptions &
  RendimientoIndividualHandlerOptions &
  RendimientoRepetitionHandlerOptions &
  RendimientoChatProxyHandlerOptions;

export const RENDIMIENTO_MODULE_STATUS = Object.freeze({
  modulo: "rendimiento",
  estado: "operativo",
  vistas: Object.freeze([
    "resumen_equipo",
    "personas",
    "reiteraciones",
    "calidad_datos",
  ]),
});

/**
 * Frontera HTTP del módulo ejecutivo. El middleware se aplica al prefijo
 * completo para que los próximos indicadores nazcan protegidos por defecto.
 */
export function createRendimientoRouter(
  options: RendimientoRouterOptions = {},
): IRouter {
  const router: IRouter = Router();

  router.use("/rendimiento", requirePerformanceAccess);
  router.get("/rendimiento", (_req, res) => {
    const status = GetRendimientoStatusResponse.parse(
      RENDIMIENTO_MODULE_STATUS,
    );
    res.set("Cache-Control", "private, no-store").json(status);
  });
  router.get(
    "/rendimiento/calidad-datos",
    createRendimientoQualityHandler(options),
  );
  router.get(
    "/rendimiento/resumen-equipo",
    createRendimientoTeamSummaryHandler(options),
  );
  router.get(
    "/rendimiento/personas",
    createRendimientoIndividualHandler(options),
  );
  router.get(
    "/rendimiento/reiteraciones",
    createRendimientoRepetitionHandler(options),
  );
  router.post(
    "/rendimiento/asistente/chat",
    createRendimientoChatProxyHandler(options),
  );

  return router;
}

const rendimientoRouter = createRendimientoRouter();

export default rendimientoRouter;
