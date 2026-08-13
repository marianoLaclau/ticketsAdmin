import {
  GetRendimientoReiteracionesQueryParams,
  GetRendimientoReiteracionesResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import type { RequestHandler } from "express";
import { runRendimientoRepetitionQuery } from "../data/repetition-query";
import {
  buildRendimientoPeriodo,
  parseRendimientoQueryParams,
  respondInvalidRendimientoFilters,
} from "./request-filters";

export type RendimientoRepetitionHandlerOptions = {
  database?: typeof db;
  now?: () => Date;
};

/** Frontera HTTP de contactos reiterados, con DB y reloj inyectables. */
export function createRendimientoRepetitionHandler({
  database = db,
  now = () => new Date(),
}: RendimientoRepetitionHandlerOptions = {}): RequestHandler {
  return (req, res) => {
    res.set("Cache-Control", "private, no-store");

    const parsed = parseRendimientoQueryParams(
      req.query,
      GetRendimientoReiteracionesQueryParams,
    );
    if (!parsed.success) {
      respondInvalidRendimientoFilters(res);
      return;
    }
    if (
      !Number.isSafeInteger(parsed.data.pagina) ||
      !Number.isSafeInteger(parsed.data.limite)
    ) {
      respondInvalidRendimientoFilters(res);
      return;
    }

    const generatedAt = now();
    const repetition = runRendimientoRepetitionQuery(
      database,
      parsed.data,
      generatedAt,
    );
    const validated = GetRendimientoReiteracionesResponse.parse({
      periodo: buildRendimientoPeriodo(parsed.data, generatedAt),
      ...repetition,
    });

    res.json({
      ...validated,
      periodo: {
        ...validated.periodo,
        ...parsed.requestedPeriod,
        generado_en: validated.periodo.generado_en.toISOString(),
      },
      contactos: validated.contactos.map((contacto) => ({
        ...contacto,
        primer_contacto: contacto.primer_contacto.toISOString(),
        ultimo_contacto: contacto.ultimo_contacto.toISOString(),
        tickets: contacto.tickets.map((ticket) => ({
          ...ticket,
          fecha_creacion: ticket.fecha_creacion.toISOString(),
          fecha_limite: ticket.fecha_limite?.toISOString() ?? null,
        })),
      })),
    });
  };
}
