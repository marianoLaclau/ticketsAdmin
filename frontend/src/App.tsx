import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import Login from "@/pages/Login";
import ChangePassword from "@/pages/ChangePassword";
import NotFound from "@/pages/not-found";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import {
  AuthGate,
  LoadingSession,
  PausedSession,
  type SessionIdentityProps,
} from "@/features/auth/AuthGate";
import { SysAdminRouteGuard } from "@/features/auth/SysAdminRouteGuard";
import {
  AppErrorBoundary,
  ErrorPage,
  getErrorStatus,
} from "@/components/ErrorPage";
import { getServerErrorCode } from "@/lib/error-messages";
import { getAuthenticatedEntryPath } from "@/lib/password-change";
import {
  clearIdentityScopedCache,
  createRemoteSessionTransitionHandler,
  getConfirmedSessionUser,
  getSessionIdentityStatus,
  getSessionVerificationState,
  isExactQueryKey,
  PUBLIC_SESSION_QUERY_POLICY,
  transitionConfirmedIdentity,
} from "@/lib/session-state";
import {
  publishSessionTransition,
  subscribeToSessionTransitions,
} from "@/lib/session-sync";

const Dashboard = React.lazy(() => import("@/pages/Dashboard"));
const TicketList = React.lazy(() => import("@/pages/TicketList"));
const TicketDetail = React.lazy(() => import("@/pages/TicketDetail"));
const Admin = React.lazy(() => import("@/pages/Admin"));
const AdminRolesUsers = React.lazy(() => import("@/pages/AdminRolesUsers"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Un 401 funcional obliga a revalidar /auth/me. Si falla la propia query
      // de sesión, se purga el estado de la identidad anterior sin invalidarla:
      // hacerlo aquí la refetchearía en loop antes de volver al login.
      const esQueryDeSesion = isExactQueryKey(
        query.queryKey,
        getGetMeQueryKey(),
      );
      const isUnauthorized = (error as { status?: number })?.status === 401;
      const requiresPasswordChange =
        getServerErrorCode(error) === "PASSWORD_CHANGE_REQUIRED";
      if (esQueryDeSesion && isUnauthorized) {
        clearIdentityScopedCache(queryClient, getGetMeQueryKey());
      } else if (
        !esQueryDeSesion &&
        (isUnauthorized || requiresPasswordChange)
      ) {
        void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const isUnauthorized = getErrorStatus(error) === 401;
      const serverErrorCode = getServerErrorCode(error);
      const requiresPasswordChange =
        serverErrorCode === "PASSWORD_CHANGE_REQUIRED";
      if (!isUnauthorized && !requiresPasswordChange) return;

      const apiError = error as { url?: unknown };
      const isAdminKeyInvalid = serverErrorCode === "ADMIN_KEY_INVALID";
      const isLoginAttempt =
        typeof apiError.url === "string" &&
        apiError.url.includes("/api/auth/login");

      // Un secreto de elevación rechazado no invalida la sesión del SysAdmin.
      // ADMIN_ELEVATION_REQUIRED ya fue reconciliado arriba y un login fallido
      // se informa dentro del formulario. Los demás 401 revalidan la sesión.
      if (requiresPasswordChange || (!isAdminKeyInvalid && !isLoginAttempt)) {
        void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
    },
  }),
});

function LoadingProtectedRoute() {
  return (
    <div
      className="flex min-h-[50vh] w-full items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <Loader2
        className="h-7 w-7 animate-spin text-muted-foreground motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="sr-only">Cargando pantalla</span>
    </div>
  );
}

/**
 * La raíz es la entrada pública. Si todavía existe una sesión válida, evita
 * mostrar nuevamente el formulario y continúa al dashboard autenticado.
 */
function PublicEntry({ acceptedUserId, onAcceptUserId }: SessionIdentityProps) {
  const [, navigate] = useLocation();
  const {
    data: me,
    error,
    fetchStatus,
    isError,
    isPending,
    refetch,
  } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      ...PUBLIC_SESSION_QUERY_POLICY,
    },
  });
  const errorStatus = getErrorStatus(error);
  const confirmedUser = getConfirmedSessionUser(me, {
    isError,
    fetchStatus,
  });
  const sessionVerificationState = getSessionVerificationState({
    isPending,
    fetchStatus,
  });
  const identityStatus = getSessionIdentityStatus(
    acceptedUserId,
    confirmedUser?.id,
  );

  React.useEffect(() => {
    if (sessionVerificationState !== "settled") return;
    if (!confirmedUser) return;

    if (identityStatus === "changed") {
      onAcceptUserId(confirmedUser.id);
      return;
    }

    if (identityStatus !== "accepted") return;
    navigate(getAuthenticatedEntryPath(confirmedUser), { replace: true });
  }, [
    confirmedUser,
    identityStatus,
    navigate,
    onAcceptUserId,
    sessionVerificationState,
  ]);

  if (sessionVerificationState === "paused") {
    return <PausedSession onRetry={() => void refetch()} />;
  }

  if (sessionVerificationState === "verifying" || confirmedUser) {
    return <LoadingSession />;
  }

  // En la entrada, un 401 significa simplemente que hay que iniciar sesión.
  if (!isError || errorStatus === 401) return <Login />;

  const esErrorDeConexion = errorStatus === undefined;
  const puedeReintentar =
    esErrorDeConexion || (errorStatus >= 500 && errorStatus <= 599);

  return (
    <ErrorPage
      status={esErrorDeConexion ? 503 : errorStatus}
      {...(esErrorDeConexion
        ? {
            message:
              "No pudimos verificar tu sesión porque el servidor no responde.",
          }
        : {})}
      homeHref={import.meta.env.BASE_URL}
      {...(puedeReintentar ? { onRetry: () => void refetch() } : {})}
      isRetrying={false}
    />
  );
}

function ProtectedRouter() {
  return (
    <AppLayout>
      <React.Suspense fallback={<LoadingProtectedRoute />}>
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/admin/roles-usuarios">
            <SysAdminRouteGuard>
              <AdminRolesUsers />
            </SysAdminRouteGuard>
          </Route>
          <Route path="/admin/tickets/:id">
            <SysAdminRouteGuard>
              <TicketDetail adminMode />
            </SysAdminRouteGuard>
          </Route>
          <Route path="/admin">
            <SysAdminRouteGuard>
              <Admin />
            </SysAdminRouteGuard>
          </Route>
          <Route path="/tickets/:id">
            <TicketDetail />
          </Route>
          <Route path="/tickets" component={TicketList} />
          <Route component={NotFound} />
        </Switch>
      </React.Suspense>
    </AppLayout>
  );
}

function App() {
  const [acceptedUserId, setAcceptedUserId] = React.useState<number | null>(
    null,
  );
  const acceptedUserIdRef = React.useRef<number | null>(null);
  const terminalIdentityTransitionRef = React.useRef(false);
  const acceptUserId = React.useCallback((userId: number) => {
    transitionConfirmedIdentity(
      queryClient,
      getGetMeQueryKey(),
      acceptedUserIdRef.current,
      userId,
      terminalIdentityTransitionRef.current,
      {
        acceptIdentity: (acceptedId) => {
          acceptedUserIdRef.current = acceptedId;
          setAcceptedUserId(acceptedId);
        },
        resetAcceptedIdentity: () => {
          terminalIdentityTransitionRef.current = true;
          acceptedUserIdRef.current = null;
          setAcceptedUserId(null);
        },
        reloadFromPublicEntry: () => {
          window.location.replace(import.meta.env.BASE_URL);
        },
      },
    );
  }, []);
  const reportConfirmedSessionLoss = React.useCallback(() => {
    publishSessionTransition(import.meta.env.BASE_URL);
  }, []);

  React.useEffect(() => {
    const handleTransition = createRemoteSessionTransitionHandler(queryClient, {
      resetAcceptedIdentity: () => {
        terminalIdentityTransitionRef.current = true;
        acceptedUserIdRef.current = null;
        setAcceptedUserId(null);
      },
      reloadFromPublicEntry: () => {
        window.location.replace(import.meta.env.BASE_URL);
      },
    });
    return subscribeToSessionTransitions(
      import.meta.env.BASE_URL,
      handleTransition,
    );
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Switch>
              <Route path="/">
                <PublicEntry
                  acceptedUserId={acceptedUserId}
                  onAcceptUserId={acceptUserId}
                />
              </Route>
              <Route>
                <AuthGate
                  acceptedUserId={acceptedUserId}
                  onAcceptUserId={acceptUserId}
                  onConfirmedSessionLoss={reportConfirmedSessionLoss}
                  passwordChangeContent={<ChangePassword />}
                >
                  <ProtectedRouter />
                </AuthGate>
              </Route>
            </Switch>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
