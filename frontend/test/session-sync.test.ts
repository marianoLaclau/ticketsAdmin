import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { createRemoteSessionTransitionHandler } from "../src/lib/session-state.ts";
import {
  SESSION_TRANSITION_STORAGE_KEY,
  isSessionTransitionStorageEvent,
  publishSessionTransition,
  subscribeToSessionTransitions,
} from "../src/lib/session-sync.ts";

function captureSignal(baseUrl = "/tickets") {
  let storedKey = "";
  let storedValue = "";
  const published = publishSessionTransition(baseUrl, {
    createNonce: () => "nonce-controlado",
    storage: {
      setItem(key, value) {
        storedKey = key;
        storedValue = value;
      },
    },
  });
  return { published, storedKey, storedValue };
}

describe("sincronización de sesión entre pestañas", () => {
  it("publica sólo versión, despliegue y nonce opaco", () => {
    const { published, storedKey, storedValue } = captureSignal();

    assert.equal(published, true);
    assert.equal(storedKey, SESSION_TRANSITION_STORAGE_KEY);
    assert.deepEqual(JSON.parse(storedValue), {
      version: 1,
      basePath: "/tickets/",
      nonce: "nonce-controlado",
    });
    assert.equal(storedValue.includes("usuario"), false);
    assert.equal(storedValue.includes("token"), false);
    assert.equal(storedValue.includes("password"), false);
  });

  it("acepta exclusivamente una señal válida del mismo despliegue", () => {
    const { storedValue } = captureSignal("/tickets/");
    const validEvent = {
      key: SESSION_TRANSITION_STORAGE_KEY,
      newValue: storedValue,
    };

    assert.equal(isSessionTransitionStorageEvent(validEvent, "/tickets"), true);
    assert.equal(
      isSessionTransitionStorageEvent(validEvent, "/otro-despliegue"),
      false,
    );
    assert.equal(
      isSessionTransitionStorageEvent(
        { ...validEvent, key: "otra-aplicacion" },
        "/tickets",
      ),
      false,
    );
    assert.equal(
      isSessionTransitionStorageEvent(
        { ...validEvent, newValue: null },
        "/tickets",
      ),
      false,
    );
    assert.equal(
      isSessionTransitionStorageEvent(
        { ...validEvent, newValue: "no es json" },
        "/tickets",
      ),
      false,
    );
    assert.equal(
      isSessionTransitionStorageEvent(
        {
          ...validEvent,
          newValue: JSON.stringify({
            version: 2,
            basePath: "/tickets/",
            nonce: "x",
          }),
        },
        "/tickets",
      ),
      false,
    );
  });

  it("suscribe, filtra y retira exactamente el listener registrado", () => {
    const { storedValue } = captureSignal();
    const concurrentSignal = JSON.stringify({
      ...JSON.parse(storedValue),
      nonce: "otro-emisor",
    });
    const queryClient = new QueryClient();
    let listener: EventListener | undefined;
    let removedListener: EventListener | undefined;
    const actions: string[] = [];
    const target = {
      addEventListener(type: "storage", nextListener: EventListener) {
        assert.equal(type, "storage");
        listener = nextListener;
      },
      removeEventListener(type: "storage", nextListener: EventListener) {
        assert.equal(type, "storage");
        removedListener = nextListener;
      },
    };

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
    const unsubscribe = subscribeToSessionTransitions(
      "/tickets",
      handleTransition,
      target,
    );

    assert.ok(listener);
    listener({ key: "otra", newValue: storedValue } as unknown as Event);
    listener({
      key: SESSION_TRANSITION_STORAGE_KEY,
      newValue: concurrentSignal,
    } as unknown as Event);
    listener({
      key: SESSION_TRANSITION_STORAGE_KEY,
      newValue: storedValue,
    } as unknown as Event);
    assert.equal(queryClient.getQueryCache().getAll().length, 0);
    assert.equal(queryClient.getMutationCache().getAll().length, 0);
    assert.deepEqual(actions, ["reset", "reload"]);

    unsubscribe();
    assert.equal(removedListener, listener);
  });

  it("degrada de forma segura si el almacenamiento o el nonce fallan", () => {
    assert.equal(
      publishSessionTransition("/", {
        storage: null,
      }),
      false,
    );
    assert.equal(
      publishSessionTransition("/", {
        createNonce: () => "",
        storage: { setItem: () => undefined },
      }),
      false,
    );
    assert.equal(
      publishSessionTransition("/", {
        createNonce: () => "nonce",
        storage: {
          setItem() {
            throw new Error("storage bloqueado");
          },
        },
      }),
      false,
    );
  });
});
