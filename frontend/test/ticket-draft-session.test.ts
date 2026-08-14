import assert from "node:assert/strict";
import test from "node:test";
import {
  transitionTicketDraftSession,
  type TicketDraftSession,
} from "../src/features/ticket-detail/ticket-draft-session.ts";

const closedSession: TicketDraftSession = {
  wasOpen: false,
  ticketId: null,
};

test("captura un baseline al abrir y no muta la sesión anterior", () => {
  const transition = transitionTicketDraftSession(closedSession, true, 12);

  assert.equal(transition.shouldReset, true);
  assert.deepEqual(transition.next, { wasOpen: true, ticketId: 12 });
  assert.deepEqual(closedSession, { wasOpen: false, ticketId: null });
});

test("preserva el draft ante una revisión SSE del mismo ticket", () => {
  const transition = transitionTicketDraftSession(
    { wasOpen: true, ticketId: 12 },
    true,
    12,
  );

  assert.equal(transition.shouldReset, false);
  assert.deepEqual(transition.next, { wasOpen: true, ticketId: 12 });
});

test("reinicia el draft si cambia el ticket mientras el diálogo sigue abierto", () => {
  const transition = transitionTicketDraftSession(
    { wasOpen: true, ticketId: 12 },
    true,
    27,
  );

  assert.equal(transition.shouldReset, true);
  assert.deepEqual(transition.next, { wasOpen: true, ticketId: 27 });
});

test("cerrar y reabrir captura los datos y la versión más recientes", () => {
  const closed = transitionTicketDraftSession(
    { wasOpen: true, ticketId: 12 },
    false,
    12,
  );
  const reopened = transitionTicketDraftSession(closed.next, true, 12);

  assert.equal(closed.shouldReset, false);
  assert.deepEqual(closed.next, { wasOpen: false, ticketId: 12 });
  assert.equal(reopened.shouldReset, true);
  assert.deepEqual(reopened.next, { wasOpen: true, ticketId: 12 });
});
