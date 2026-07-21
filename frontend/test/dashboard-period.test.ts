import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentMonthToToday,
  getDashboardRangeLabel,
  getDashboardPeriodParams,
  validateDashboardDateRange,
} from '../src/lib/dashboard-period.ts';

const tuesday = new Date(2026, 6, 21, 12, 0, 0);

test('Todo conserva el dashboard sin filtros', () => {
  assert.equal(getDashboardPeriodParams('todo', tuesday), undefined);
});

test('Semana abarca de lunes a domingo', () => {
  assert.deepEqual(getDashboardPeriodParams('semana', tuesday), {
    fecha_desde: '2026-07-20',
    fecha_hasta: '2026-07-26',
  });
});

test('Mes abarca el mes calendario completo', () => {
  assert.deepEqual(getDashboardPeriodParams('mes', tuesday), {
    fecha_desde: '2026-07-01',
    fecha_hasta: '2026-07-31',
  });
});

test('El periodo personalizado comienza con el mes hasta hoy', () => {
  assert.deepEqual(currentMonthToToday(tuesday), {
    fecha_desde: '2026-07-01',
    fecha_hasta: '2026-07-21',
  });
});

test('Valida fechas personalizadas completas y ordenadas', () => {
  assert.equal(validateDashboardDateRange('', '2026-07-21'), 'Completá las fechas desde y hasta.');
  assert.equal(
    validateDashboardDateRange('2026-07-22', '2026-07-21'),
    'La fecha desde no puede ser posterior a la fecha hasta.',
  );
  assert.equal(validateDashboardDateRange('2026-07-01', '2026-07-21'), null);
});

test('Presenta el rango aplicado en formato local', () => {
  assert.equal(
    getDashboardRangeLabel({ fecha_desde: '2026-07-01', fecha_hasta: '2026-07-21' }),
    '01/07/2026 al 21/07/2026',
  );
});
