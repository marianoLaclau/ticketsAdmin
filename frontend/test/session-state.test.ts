import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  clearAuthenticatedQueries,
  clearRevokedSessionState,
  hasConfirmedPublicSession,
} from "../src/lib/session-state.ts";

describe("estado cliente de la sesión", () => {
  it("no confía en datos stale cuando la revalidación falla o sigue pendiente", () => {
    const staleUser = { id: 1 };

    assert.equal(hasConfirmedPublicSession(staleUser, false, false), true);
    assert.equal(hasConfirmedPublicSession(staleUser, true, false), false);
    assert.equal(hasConfirmedPublicSession(staleUser, false, true), false);
    assert.equal(hasConfirmedPublicSession(undefined, false, false), false);
  });

  it("descarta queries del usuario anterior sin reiniciar la query de sesión", () => {
    const queryClient = new QueryClient();
    const sessionKey = ["/api/auth/me"] as const;
    const staleUser = { id: 1 };

    queryClient.setQueryData(sessionKey, staleUser);
    queryClient.setQueryData(["tickets"], [{ id: 99 }]);
    queryClient.setQueryData(["dashboard", "stats"], { total: 12 });

    clearAuthenticatedQueries(queryClient, sessionKey);

    assert.deepEqual(queryClient.getQueryData(sessionKey), staleUser);
    assert.equal(queryClient.getQueryData(["tickets"]), undefined);
    assert.equal(queryClient.getQueryData(["dashboard", "stats"]), undefined);
  });

  it("descarta de inmediato toda la caché ante una revocación terminal", () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(["/api/auth/me"], { id: 1 });
    queryClient.setQueryData(["tickets"], [{ id: 99 }]);
    queryClient.setQueryData(["dashboard", "stats"], { total: 12 });

    clearRevokedSessionState(queryClient);

    assert.equal(queryClient.getQueryCache().getAll().length, 0);
  });
});
