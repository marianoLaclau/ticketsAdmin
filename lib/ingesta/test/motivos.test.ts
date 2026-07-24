import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clasificarMotivo,
  MOTIVO_CATEGORIA_CODIGOS,
  MOTIVO_CATEGORIA_LABELS,
} from "../src/motivos.ts";

describe("categoría Embargos", () => {
  const casosEmbargos = [
    "Consulta por un embargo de sueldo",
    "Le embargaron la cuenta bancaria",
    "Recibió un oficio de embargo",
    "Solicita el levantamiento del embargo judicial",
    "Le aplican una retención judicial de haberes",
    "Tiene un descuento en el recibo por orden judicial",
    "Recibió una orden judicial para retener parte del sueldo",
    "Consulta por el desembargo de una cuenta",
  ];

  for (const motivo of casosEmbargos) {
    it(`clasifica como embargo: ${motivo}`, () => {
      assert.equal(clasificarMotivo(motivo), "embargos");
    });
  }

  it("tiene precedencia sobre categorías generales", () => {
    assert.equal(
      clasificarMotivo("Reclama un embargo en el recibo de sueldo"),
      "embargos",
    );
    assert.equal(
      clasificarMotivo("Necesita asesoramiento legal por un embargo salarial"),
      "embargos",
    );
    assert.equal(
      clasificarMotivo("Consulta por una medida cautelar judicial"),
      "legales",
    );
  });

  it("usa el resumen si el motivo no aporta una categoría", () => {
    assert.equal(
      clasificarMotivo(
        "Necesita ayuda",
        "Le realizan una retención de haberes por orden judicial",
      ),
      "embargos",
    );
  });

  it("no confunde la expresión 'sin embargo' con la categoría", () => {
    assert.equal(
      clasificarMotivo("Sin embargo, necesita su recibo de sueldo"),
      "recibos_documentacion",
    );
    assert.equal(
      clasificarMotivo("Sin embargo, necesita ayuda"),
      "sin_clasificar",
    );
    assert.equal(
      clasificarMotivo(
        "Sin embargo, también consulta por un embargo salarial",
      ),
      "embargos",
    );
  });

  it("expone el código y la etiqueta en el catálogo estable", () => {
    assert.ok(MOTIVO_CATEGORIA_CODIGOS.includes("embargos"));
    assert.equal(MOTIVO_CATEGORIA_LABELS.embargos, "Embargos");
  });
});

describe("categoría Legales", () => {
  const casosLegales = [
    "Necesita asesoramiento legal por un conflicto laboral",
    "Consulta por una carta documento recibida luego del despido",
    "Quiere iniciar un juicio laboral",
    "Fue citado a una audiencia de conciliación en SECLO",
    "Solicita hablar con una abogada",
    "Recibió una intimación formal",
  ];

  for (const motivo of casosLegales) {
    it(`clasifica como legal: ${motivo}`, () => {
      assert.equal(clasificarMotivo(motivo), "legales");
    });
  }

  it("usa el resumen solo cuando el motivo no tiene una categoría conocida", () => {
    assert.equal(
      clasificarMotivo(
        "Necesita ayuda",
        "Consulta jurídica por un telegrama laboral",
      ),
      "legales",
    );
    assert.equal(
      clasificarMotivo("Solicita su recibo de sueldo", "Llamó a su abogado"),
      "recibos_documentacion",
    );
  });

  it("no convierte referencias ambiguas en asuntos legales", () => {
    assert.equal(
      clasificarMotivo("Necesita conocer el nombre legal de la empresa"),
      "sin_clasificar",
    );
    assert.equal(
      clasificarMotivo("Consulta sobre derechos y beneficios"),
      "sin_clasificar",
    );
    assert.equal(clasificarMotivo("Consulta por despido"), "bajas_liquidacion");
    assert.equal(
      clasificarMotivo(
        "Necesita el recibo de sueldo para entregárselo a su abogado",
      ),
      "recibos_documentacion",
    );
    assert.equal(
      clasificarMotivo("Consulta por el recibo de sueldo para su abogado"),
      "recibos_documentacion",
    );
    assert.equal(
      clasificarMotivo("Una abogada se postula para un empleo"),
      "empleo_postulaciones",
    );
  });

  it("expone el código y la etiqueta en el catálogo estable", () => {
    assert.ok(MOTIVO_CATEGORIA_CODIGOS.includes("legales"));
    assert.equal(MOTIVO_CATEGORIA_LABELS.legales, "Legales");
  });

  it("no modifica los textos originales", () => {
    const motivo = "  Consulta Jurídica: recibió una Carta Documento.  ";
    const resumen = "La persona solicita orientación.";

    clasificarMotivo(motivo, resumen);

    assert.equal(motivo, "  Consulta Jurídica: recibió una Carta Documento.  ");
    assert.equal(resumen, "La persona solicita orientación.");
  });
});
