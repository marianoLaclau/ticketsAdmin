import assert from "node:assert/strict";
import axe, { type ElementContext, type RunOptions } from "axe-core";

const JSDOM_RULE_OVERRIDES: NonNullable<RunOptions["rules"]> = {
  // JSDOM no implementa el canvas que axe usa para calcular contraste. El
  // contraste de la paleta se valida por tokens y en el smoke del navegador.
  "color-contrast": { enabled: false },
};

export async function assertNoAxeViolations(
  context: ElementContext = document.body,
  options: RunOptions = {},
): Promise<void> {
  const result = await axe.run(context, {
    ...options,
    rules: {
      ...JSDOM_RULE_OVERRIDES,
      ...options.rules,
    },
  });

  assert.deepEqual(
    result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    })),
    [],
    result.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help} (${violation.nodes
            .flatMap((node) => node.target)
            .join(", ")})`,
      )
      .join("\n"),
  );
}
