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

export type RendimientoRouterOptions = RendimientoQualityHandlerOptions &
  RendimientoTeamSummaryHandlerOptions;

export const RENDIMIENTO_MODULE_STATUS = Object.freeze({
  modulo: "rendimiento",
  estado: "operativo_parcial",
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

  return router;
}

const rendimientoRouter = createRendimientoRouter();

export default rendimientoRouter;
