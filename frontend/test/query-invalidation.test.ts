import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateTicketDomainQueries,
  isTicketDomainQueryKey,
} from "../src/lib/query-invalidation.ts";

describe("invalidación del dominio de tickets", () => {
  it("reconoce endpoints y variantes sin aceptar prefijos parecidos", () => {
    assert.equal(isTicketDomainQueryKey(["/api/tickets"]), true);
    assert.equal(isTicketDomainQueryKey(["/api/tickets", 17]), true);
    assert.equal(isTicketDomainQueryKey(["/api/tickets/17"]), true);
    assert.equal(isTicketDomainQueryKey(["/api/dashboard/stats"]), true);
    assert.equal(isTicketDomainQueryKey(["/api/dashboard"]), true);

    assert.equal(isTicketDomainQueryKey(["/api/tickets-archive"]), false);
    assert.equal(isTicketDomainQueryKey(["/api/dashboarding"]), false);
    assert.equal(isTicketDomainQueryKey([42, "/api/tickets"]), false);
  });

  it("invalida tickets y dashboard sin tocar sesión ni administración", async () => {
    const queryClient = new QueryClient();
    const domainKeys = [
      ["/api/tickets"],
      ["/api/tickets", { page: 2 }],
      ["/api/tickets", 17, "operativo", "seguimientos"],
      ["/api/dashboard/stats", { fecha_desde: "2026-08-01" }],
      ["/api/dashboard/actividad-reciente"],
    ] as const;
    const unrelatedKeys = [
      ["/api/auth/me"],
      // Refleja la key identity-scoped construida por useAdminElevation.
      ["/api/auth/admin-elevation", "user", 3],
      ["/api/admin/roles"],
      ["/api/admin/users", { page: 1 }],
    ] as const;

    for (const queryKey of [...domainKeys, ...unrelatedKeys]) {
      queryClient.setQueryData(queryKey, { cached: true });
    }

    await invalidateTicketDomainQueries(queryClient);

    for (const queryKey of domainKeys) {
      assert.equal(queryClient.getQueryState(queryKey)?.isInvalidated, true);
    }
    for (const queryKey of unrelatedKeys) {
      assert.equal(queryClient.getQueryState(queryKey)?.isInvalidated, false);
    }
  });
});
