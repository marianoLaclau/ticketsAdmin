import assert from "node:assert/strict";
import test from "node:test";
import {
  currentMonthToToday,
  getDashboardBusinessDateKey,
  getDashboardPeriodParams,
  getDashboardRangeKey,
  getDashboardRangeLabel,
  shouldRefreshDashboardAtBusinessDateChange,
  validateDashboardDateRange,
} from "../src/lib/dashboard-period.ts";

const tuesday = new Date("2026-07-21T15:00:00.000Z");

test("Todo conserva el dashboard sin filtros", () => {
  assert.equal(getDashboardPeriodParams("todo", tuesday), undefined);
});

test("Semana abarca de lunes a domingo", () => {
  assert.deepEqual(getDashboardPeriodParams("semana", tuesday), {
    fecha_desde: "2026-07-20",
    fecha_hasta: "2026-07-26",
  });
});

test("Mes abarca el mes calendario completo", () => {
  assert.deepEqual(getDashboardPeriodParams("mes", tuesday), {
    fecha_desde: "2026-07-01",
    fecha_hasta: "2026-07-31",
  });
});

test("Mes respeta febrero en años comunes y bisiestos", () => {
  assert.deepEqual(
    getDashboardPeriodParams("mes", new Date("2024-02-15T15:00:00.000Z")),
    {
      fecha_desde: "2024-02-01",
      fecha_hasta: "2024-02-29",
    },
  );
  assert.deepEqual(
    getDashboardPeriodParams("mes", new Date("2026-02-15T15:00:00.000Z")),
    {
      fecha_desde: "2026-02-01",
      fecha_hasta: "2026-02-28",
    },
  );
});

test("El periodo personalizado comienza con el mes hasta hoy", () => {
  assert.deepEqual(currentMonthToToday(tuesday), {
    fecha_desde: "2026-07-01",
    fecha_hasta: "2026-07-21",
  });
});

test("Valida fechas personalizadas completas, reales y ordenadas", () => {
  assert.equal(
    validateDashboardDateRange("", "2026-07-21"),
    "Completá las fechas desde y hasta.",
  );
  assert.equal(
    validateDashboardDateRange("2026-02-30", "2026-03-01"),
    "Ingresá fechas válidas.",
  );
  assert.equal(
    validateDashboardDateRange("2026-07-22", "2026-07-21"),
    "La fecha desde no puede ser posterior a la fecha hasta.",
  );
  assert.equal(validateDashboardDateRange("2026-07-01", "2026-07-21"), null);
});

test("Presenta el rango aplicado en formato local", () => {
  assert.equal(
    getDashboardRangeLabel({
      fecha_desde: "2026-07-01",
      fecha_hasta: "2026-07-21",
    }),
    "01/07/2026 al 21/07/2026",
  );
});

test("Usa la fecha de Buenos Aires cerca de medianoche UTC", () => {
  const sundayInBuenosAires = new Date("2026-08-03T02:30:00.000Z");

  assert.equal(getDashboardBusinessDateKey(sundayInBuenosAires), "2026-08-02");
  assert.deepEqual(getDashboardPeriodParams("semana", sundayInBuenosAires), {
    fecha_desde: "2026-07-27",
    fecha_hasta: "2026-08-02",
  });
});

test("Cambia de semana al comenzar el lunes en Buenos Aires", () => {
  const mondayInBuenosAires = new Date("2026-08-03T03:30:00.000Z");

  assert.equal(getDashboardBusinessDateKey(mondayInBuenosAires), "2026-08-03");
  assert.deepEqual(getDashboardPeriodParams("semana", mondayInBuenosAires), {
    fecha_desde: "2026-08-03",
    fecha_hasta: "2026-08-09",
  });
});

test("Respeta el mes y año de negocio aunque UTC ya haya cambiado", () => {
  const decemberInBuenosAires = new Date("2027-01-01T01:00:00.000Z");

  assert.deepEqual(currentMonthToToday(decemberInBuenosAires), {
    fecha_desde: "2026-12-01",
    fecha_hasta: "2026-12-31",
  });
  assert.deepEqual(getDashboardPeriodParams("mes", decemberInBuenosAires), {
    fecha_desde: "2026-12-01",
    fecha_hasta: "2026-12-31",
  });
  assert.deepEqual(getDashboardPeriodParams("semana", decemberInBuenosAires), {
    fecha_desde: "2026-12-28",
    fecha_hasta: "2027-01-03",
  });
});

test("Refresca al cambiar el día sólo si la query conserva su rango", () => {
  const previous = {
    businessDateKey: "2026-08-02",
    rangeKey: getDashboardRangeKey(undefined),
  };

  assert.equal(
    shouldRefreshDashboardAtBusinessDateChange(previous, {
      businessDateKey: "2026-08-02",
      rangeKey: "todo",
    }),
    false,
  );
  assert.equal(
    shouldRefreshDashboardAtBusinessDateChange(previous, {
      businessDateKey: "2026-08-03",
      rangeKey: "todo",
    }),
    true,
  );
  assert.equal(
    shouldRefreshDashboardAtBusinessDateChange(previous, {
      businessDateKey: "2026-08-03",
      rangeKey: getDashboardRangeKey({
        fecha_desde: "2026-08-03",
        fecha_hasta: "2026-08-09",
      }),
    }),
    false,
  );
});
