import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  clearAuthenticatedQueries,
  clearIdentityScopedCache,
  clearRevokedSessionState,
  createRemoteSessionTransitionHandler,
  getConfirmedSessionUser,
  getSessionIdentityStatus,
  getSessionVerificationState,
  PUBLIC_SESSION_QUERY_POLICY,
} from "../src/lib/session-state.ts";

describe("estado cliente de la sesión", () => {
  it("verifica la entrada al montar sin competir con el envío del login", () => {
    assert.deepEqual(PUBLIC_SESSION_QUERY_POLICY, {
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      retry: false,
    });
    assert.equal(Object.isFrozen(PUBLIC_SESSION_QUERY_POLICY), true);
  });

  it("no confía en datos stale cuando la revalidación falla o sigue pendiente", () => {
    const staleUser = { id: 1 };

    assert.equal(
      getConfirmedSessionUser(staleUser, {
        isError: false,
        fetchStatus: "idle",
      }),
      staleUser,
    );
    assert.equal(
      getConfirmedSessionUser(staleUser, {
        isError: true,
        fetchStatus: "idle",
      }),
      undefined,
    );
    assert.equal(
      getConfirmedSessionUser(staleUser, {
        isError: false,
        fetchStatus: "fetching",
      }),
      undefined,
    );
    assert.equal(
      getConfirmedSessionUser(staleUser, {
        isError: true,
        fetchStatus: "fetching",
      }),
      undefined,
    );
    assert.equal(
      getConfirmedSessionUser(staleUser, {
        isError: false,
        fetchStatus: "paused",
      }),
      undefined,
    );
    assert.equal(
      getConfirmedSessionUser(undefined, {
        isError: false,
        fetchStatus: "idle",
      }),
      undefined,
    );
  });

  it("distingue una sesión asentada, en verificación o pausada", () => {
    assert.equal(
      getSessionVerificationState({ isPending: false, fetchStatus: "idle" }),
      "settled",
    );
    assert.equal(
      getSessionVerificationState({ isPending: true, fetchStatus: "idle" }),
      "verifying",
    );
    assert.equal(
      getSessionVerificationState({
        isPending: false,
        fetchStatus: "fetching",
      }),
      "verifying",
    );
    assert.equal(
      getSessionVerificationState({
        isPending: false,
        fetchStatus: "paused",
      }),
      "paused",
    );
  });

  it("exige aceptar una identidad nueva antes de continuar", () => {
    assert.equal(getSessionIdentityStatus(1, undefined), "unconfirmed");
    assert.equal(getSessionIdentityStatus(1, 2), "changed");
    assert.equal(getSessionIdentityStatus(2, 2), "accepted");
    assert.equal(getSessionIdentityStatus(null, 2), "changed");
  });

  it("al aceptar B conserva su sesión y descarta las queries funcionales de A", () => {
    const queryClient = new QueryClient();
    const sessionKey = ["/api/auth/me"] as const;
    const confirmedUserB = { id: 2 };

    queryClient.setQueryData(sessionKey, confirmedUserB);
    queryClient.setQueryData(["tickets"], [{ id: 99, ownerUserId: 1 }]);
    queryClient.setQueryData(["dashboard", "stats"], {
      ownerUserId: 1,
      total: 12,
    });

    clearAuthenticatedQueries(queryClient, sessionKey);

    assert.deepEqual(queryClient.getQueryData(sessionKey), confirmedUserB);
    assert.equal(queryClient.getQueryData(["tickets"]), undefined);
    assert.equal(queryClient.getQueryData(["dashboard", "stats"]), undefined);
  });

  it("al aceptar B elimina también las mutaciones pertenecientes a A", () => {
    const queryClient = new QueryClient();
    const sessionKey = ["/api/auth/me"] as const;
    const confirmedUserB = { id: 2 };

    queryClient.setQueryData(sessionKey, confirmedUserB);
    queryClient.setQueryData(["tickets"], [{ id: 99, ownerUserId: 1 }]);
    queryClient.getMutationCache().build(queryClient, {
      mutationKey: ["update-ticket", 99],
      mutationFn: async () => undefined,
    });

    assert.equal(queryClient.getMutationCache().getAll().length, 1);
    clearIdentityScopedCache(queryClient, sessionKey);

    assert.deepEqual(queryClient.getQueryData(sessionKey), confirmedUserB);
    assert.equal(queryClient.getQueryData(["tickets"]), undefined);
    assert.equal(queryClient.getMutationCache().getAll().length, 0);
  });

  it("descarta de inmediato toda la caché ante una revocación terminal", () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(["/api/auth/me"], { id: 1 });
    queryClient.setQueryData(["tickets"], [{ id: 99 }]);
    queryClient.setQueryData(["dashboard", "stats"], { total: 12 });
    queryClient.getMutationCache().build(queryClient, {
      mutationKey: ["update-ticket", 99],
      mutationFn: async () => undefined,
    });

    clearRevokedSessionState(queryClient);

    assert.equal(queryClient.getQueryCache().getAll().length, 0);
    assert.equal(queryClient.getMutationCache().getAll().length, 0);
  });

  it("una transición remota purga y recarga una sola vez", () => {
    const queryClient = new QueryClient();
    const actions: string[] = [];
    queryClient.setQueryData(["/api/auth/me"], { id: 1 });
    queryClient.setQueryData(["tickets"], [{ id: 99, ownerUserId: 1 }]);
    queryClient.getMutationCache().build(queryClient, {
      mutationKey: ["update-ticket", 99],
      mutationFn: async () => undefined,
    });
    const handleTransition = createRemoteSessionTransitionHandler(queryClient, {
      resetAcceptedIdentity: () => actions.push("reset"),
      reloadFromPublicEntry: () => actions.push("reload"),
    });

    handleTransition();
    handleTransition();

    assert.equal(queryClient.getQueryCache().getAll().length, 0);
    assert.equal(queryClient.getMutationCache().getAll().length, 0);
    assert.deepEqual(actions, ["reset", "reload"]);
  });

  it("una rotación puede purgar la propia mutación antes de fijar la sesión nueva", async () => {
    const queryClient = new QueryClient();
    const sessionKey = ["/api/auth/me"] as const;
    const rotatedUser = { id: 1, debe_cambiar_password: false };
    queryClient.setQueryData(sessionKey, {
      id: 1,
      debe_cambiar_password: true,
    });
    queryClient.setQueryData(["tickets"], [{ id: 99, ownerUserId: 1 }]);
    const passwordMutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ["change-own-password"],
      mutationFn: async () => rotatedUser,
      onSuccess: (user) => {
        clearIdentityScopedCache(queryClient, sessionKey);
        queryClient.setQueryData(sessionKey, user);
      },
    });

    await passwordMutation.execute(undefined);

    assert.deepEqual(queryClient.getQueryData(sessionKey), rotatedUser);
    assert.equal(queryClient.getQueryData(["tickets"]), undefined);
    assert.equal(queryClient.getMutationCache().getAll().length, 0);
  });
});
