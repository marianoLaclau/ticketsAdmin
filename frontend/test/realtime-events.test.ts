import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SESSION_REVOKED_EVENT,
  isSessionRevokedEvent,
  parseRealtimeEvent,
} from '../src/lib/realtime-events.ts';

describe('eventos en tiempo real', () => {
  it('reconoce únicamente el evento terminal de sesión', () => {
    const revoked = parseRealtimeEvent(
      JSON.stringify({ tipo: SESSION_REVOKED_EVENT }),
    );
    const ticket = parseRealtimeEvent(
      JSON.stringify({ tipo: 'ticket_creado', ticket_id: 8 }),
    );

    assert.ok(revoked);
    assert.equal(isSessionRevokedEvent(revoked), true);
    assert.ok(ticket);
    assert.equal(isSessionRevokedEvent(ticket), false);
  });

  it('rechaza JSON inválido y eventos sin tipo', () => {
    assert.equal(parseRealtimeEvent('{'), null);
    assert.equal(parseRealtimeEvent('null'), null);
    assert.equal(parseRealtimeEvent('[]'), null);
    assert.equal(parseRealtimeEvent('{"ticket_id":1}'), null);
    assert.equal(parseRealtimeEvent('{"tipo":"   "}'), null);
  });

  it('conserva solo los campos de tipos seguros para la interfaz', () => {
    assert.deepEqual(
      parseRealtimeEvent(
        JSON.stringify({
          tipo: 'ticket_creado',
          ticket_id: 12,
          nombre: 'Ana',
          apellido: null,
          motivo: { texto: 'no confiable' },
          cantidad: '3',
          cantidad_total: 4,
          secreto: 'descartado',
        }),
      ),
      {
        tipo: 'ticket_creado',
        ticket_id: 12,
        nombre: 'Ana',
        apellido: null,
        motivo: undefined,
        cantidad: undefined,
        cantidad_total: 4,
      },
    );
  });
});
