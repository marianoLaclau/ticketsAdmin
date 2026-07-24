import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTicketExportParams,
  buildTicketListParams,
  createDefaultTicketSort,
  createTicketCsvFilename,
  downloadTicketCsv,
  isDefaultTicketSort,
  nextTicketSort,
  serializeTicketSort,
  type TicketCsvDownloadAdapter,
  type TicketSortRule,
} from '../src/lib/ticket-list-controls.ts';

const filters = {
  search: '  Ana  ',
  estado: 'pendiente' as const,
  prioridad: 'urgente' as const,
  motivo_categoria: 'embargos' as const,
  vencidos: true,
  fecha_desde: '2026-07-01',
  fecha_hasta: '2026-07-22',
  hora_desde: '08:00',
  hora_hasta: '18:00',
  empresa: '  GSB  ',
};

const defaultSort: TicketSortRule[] = [{ sortBy: 'fecha_creacion', order: 'desc' }];

test('restablece y reconoce el orden predeterminado por llegada reciente', () => {
  const restored = createDefaultTicketSort();

  assert.deepEqual(restored, [{ sortBy: 'fecha_creacion', order: 'desc' }]);
  assert.equal(isDefaultTicketSort(restored), true);
  assert.equal(isDefaultTicketSort([{ sortBy: 'fecha_creacion', order: 'asc' }]), false);
  assert.equal(
    isDefaultTicketSort([
      { sortBy: 'fecha_creacion', order: 'desc' },
      { sortBy: 'contacto', order: 'asc' },
    ]),
    false,
  );
});

test('un clic simple sobre la misma columna invierte el sentido', () => {
  assert.deepEqual(nextTicketSort(defaultSort, 'fecha_creacion'), [
    {
      sortBy: 'fecha_creacion',
      order: 'asc',
    },
  ]);
});

test('un clic simple reemplaza los criterios anteriores', () => {
  const current: TicketSortRule[] = [
    { sortBy: 'fecha_creacion', order: 'desc' },
    { sortBy: 'contacto', order: 'asc' },
  ];

  assert.deepEqual(nextTicketSort(current, 'prioridad'), [
    {
      sortBy: 'prioridad',
      order: 'asc',
    },
  ]);
});

test('Shift+clic agrega una columna ascendente al final', () => {
  assert.deepEqual(nextTicketSort(defaultSort, 'contacto', true), [
    { sortBy: 'fecha_creacion', order: 'desc' },
    { sortBy: 'contacto', order: 'asc' },
  ]);
});

test('Shift+clic invierte una columna activa sin cambiar prioridades ni duplicarla', () => {
  const current: TicketSortRule[] = [
    { sortBy: 'fecha_creacion', order: 'desc' },
    { sortBy: 'contacto', order: 'asc' },
  ];

  assert.deepEqual(nextTicketSort(current, 'contacto', true), [
    { sortBy: 'fecha_creacion', order: 'desc' },
    { sortBy: 'contacto', order: 'desc' },
  ]);
});

test('serializa criterios en su orden de prioridad', () => {
  assert.equal(
    serializeTicketSort([
      { sortBy: 'fecha_creacion', order: 'desc' },
      { sortBy: 'contacto', order: 'asc' },
    ]),
    'fecha_creacion:desc,contacto:asc',
  );
});

test('listado y exportacion comparten filtros y orden', () => {
  const sort: TicketSortRule[] = [
    { sortBy: 'prioridad', order: 'desc' },
    { sortBy: 'contacto', order: 'asc' },
  ];
  const listParams = buildTicketListParams(filters, sort, 3, 25);
  const exportParams = buildTicketExportParams(filters, sort);

  assert.deepEqual(listParams, {
    search: 'Ana',
    estado: 'pendiente',
    prioridad: 'urgente',
    motivo_categoria: 'embargos',
    vencidos: true,
    fecha_desde: '2026-07-01',
    fecha_hasta: '2026-07-22',
    hora_desde: '08:00',
    hora_hasta: '18:00',
    empresa: 'GSB',
    sort: 'prioridad:desc,contacto:asc',
    sort_by: 'prioridad',
    order: 'desc',
    page: 3,
    limit: 25,
  });
  assert.deepEqual(exportParams, {
    search: 'Ana',
    estado: 'pendiente',
    prioridad: 'urgente',
    motivo_categoria: 'embargos',
    vencidos: true,
    fecha_desde: '2026-07-01',
    fecha_hasta: '2026-07-22',
    hora_desde: '08:00',
    hora_hasta: '18:00',
    empresa: 'GSB',
    sort: 'prioridad:desc,contacto:asc',
    sort_by: 'prioridad',
    order: 'desc',
  });
  assert.equal('page' in exportParams, false);
  assert.equal('limit' in exportParams, false);
  assert.equal('incluir_vacios' in exportParams, false);
});

test('genera un nombre fechado en la zona de Buenos Aires', () => {
  assert.equal(createTicketCsvFilename(new Date('2026-07-23T01:30:00.000Z')), 'tickets-2026-07-22.csv');
});

test('descarga un Blob CSV y siempre libera la URL temporal', async () => {
  let capturedBlob: Blob | undefined;
  let capturedFilename = '';
  let revokedUrl = '';
  const adapter: TicketCsvDownloadAdapter = {
    createObjectUrl: (blob) => {
      capturedBlob = blob;
      return 'blob:test-ticket';
    },
    triggerDownload: (url, filename) => {
      assert.equal(url, 'blob:test-ticket');
      capturedFilename = filename;
    },
    revokeObjectUrl: (url) => {
      revokedUrl = url;
    },
  };

  // Simula el texto devuelto por fetch, que puede llegar sin el BOM original.
  downloadTicketCsv('"ID"\r\n"1"', 'tickets-prueba.csv', adapter);

  assert.ok(capturedBlob);
  assert.equal(capturedBlob.type, 'text/csv;charset=utf-8');
  const bytes = new Uint8Array(await capturedBlob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(new TextDecoder().decode(bytes.slice(3)), '"ID"\r\n"1"');
  assert.equal(capturedFilename, 'tickets-prueba.csv');
  assert.equal(revokedUrl, 'blob:test-ticket');
});
