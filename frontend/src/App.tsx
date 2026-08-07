import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import Dashboard from "@/pages/Dashboard";
import TicketList from "@/pages/TicketList";
import TicketDetail from "@/pages/TicketDetail";
import Admin from "@/pages/Admin";
import AdminRolesUsers from "@/pages/AdminRolesUsers";
import Login from "@/pages/Login";
import ChangePassword from "@/pages/ChangePassword";
import NotFound from "@/pages/not-found";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { ROL_SYSADMIN } from "@/lib/roles";
import {
  AppErrorBoundary,
  ErrorPage,
  getErrorStatus,
} from "@/components/ErrorPage";
import { getServerErrorCode } from "@/lib/error-messages";
import {
  PASSWORD_CHANGE_PATH,
  getAuthenticatedEntryPath,
} from "@/lib/password-change";
import {
  clearAuthenticatedQueries,
  hasConfirmedPublicSession,
} from "@/lib/session-state";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Si cualquier request devuelve 401 (sesión vencida o revocada),
      // se invalida /auth/me y el AuthGate manda de vuelta al login.
      // IMPORTANTE: excluir a /auth/me de este handler — si su propio 401
      // la invalida, se refetchea, vuelve a dar 401 y entra en loop infinito.
      const esQueryDeSesion = query.queryKey[0] === getGetMeQueryKey()[0];
      const isUnauthorized = (error as { status?: number })?.status === 401;
      const requiresPasswordChange =
        getServerErrorCode(error) === "PASSWORD_CHANGE_REQUIRED";
      if (esQueryDeSesion && isUnauthorized) {
        clearAuthenticatedQueries(queryClient, getGetMeQueryKey());
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
      const requiresPasswordChange =
        getServerErrorCode(error) === "PASSWORD_CHANGE_REQUIRED";
      if (!isUnauthorized && !requiresPasswordChange) return;

      const apiError = error as { data?: { error?: unknown }; url?: unknown };
      const serverMessage = apiError.data?.error;
      const isAdminKeyError =
        typeof serverMessage === "string" &&
        serverMessage.toLowerCase().includes("administración");
      const isLoginAttempt =
        typeof apiError.url === "string" &&
        apiError.url.includes("/api/auth/login");

      // Una API key incorrecta no invalida la sesión del SysAdmin, y un login
      // fallido ya se informa dentro del formulario. El resto de los 401 en
      // mutaciones obliga a revalidar la sesión y, si venció, vuelve a la raíz.
      if (requiresPasswordChange || (!isAdminKeyError && !isLoginAttempt)) {
        void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
    },
  }),
});

/**
 * Las pantallas de administración existen únicamente para el rol SysAdmin.
 * El backend valida lo mismo (403); esto evita renderizar la UI siquiera.
 */
function SoloSysAdmin({ children }: { children: React.ReactNode }) {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  if (me?.rol !== ROL_SYSADMIN) return <ErrorPage status={403} />;
  return <>{children}</>;
}

function LoadingSession() {
  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center">
      <Loader2 className="h-8 w-8 text-white/60 animate-spin" />
    </div>
  );
}

/**
 * La raíz es la entrada pública. Si todavía existe una sesión válida, evita
 * mostrar nuevamente el formulario y continúa al dashboard autenticado.
 */
function PublicEntry() {
  const [, navigate] = useLocation();
  const {
    data: me,
    error,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnWindowFocus: true,
    },
  });
  const errorStatus = getErrorStatus(error);
  const hasConfirmedSession = hasConfirmedPublicSession(
    me,
    isError,
    isFetching,
  );

  React.useEffect(() => {
    if (hasConfirmedSession) {
      navigate(getAuthenticatedEntryPath(me), { replace: true });
    }
  }, [hasConfirmedSession, me, navigate]);

  if (isLoading || isFetching || hasConfirmedSession) return <LoadingSession />;

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
      isRetrying={isFetching}
    />
  );
}

/**
 * Candado de toda la aplicación: sin sesión válida no se renderiza NINGUNA
 * pantalla. Un 401 normaliza la URL a la raíz, donde vive el login; los
 * errores de red/servidor se muestran aparte y permiten reintentar.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const {
    data: me,
    error,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnWindowFocus: true,
    },
  });
  const errorStatus = getErrorStatus(error);

  React.useEffect(() => {
    if (isError && errorStatus === 401) {
      navigate("/", { replace: true });
    } else if (!isLoading && !isError && !me) {
      navigate("/", { replace: true });
    } else if (me) {
      const target = getAuthenticatedEntryPath(me);
      const passwordChangeRequired = target === PASSWORD_CHANGE_PATH;
      if (passwordChangeRequired && location !== target) {
        navigate(target, { replace: true });
      } else if (!passwordChangeRequired && location === PASSWORD_CHANGE_PATH) {
        navigate(target, { replace: true });
      }
    }
  }, [errorStatus, isError, isLoading, location, me, navigate]);

  if (isLoading) return <LoadingSession />;

  if (isError) {
    if (errorStatus === 401) return <LoadingSession />;

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
        isRetrying={isFetching}
      />
    );
  }

  if (!me) return <LoadingSession />;

  if (getAuthenticatedEntryPath(me) === PASSWORD_CHANGE_PATH) {
    if (location !== PASSWORD_CHANGE_PATH) return <LoadingSession />;
    return <ChangePassword />;
  }
  if (location === PASSWORD_CHANGE_PATH) return <LoadingSession />;

  return <>{children}</>;
}

function ProtectedRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/admin/roles-usuarios">
          <SoloSysAdmin>
            <AdminRolesUsers />
          </SoloSysAdmin>
        </Route>
        <Route path="/admin/tickets/:id">
          <SoloSysAdmin>
            <TicketDetail adminMode />
          </SoloSysAdmin>
        </Route>
        <Route path="/admin">
          <SoloSysAdmin>
            <Admin />
          </SoloSysAdmin>
        </Route>
        <Route path="/tickets/:id">
          <TicketDetail />
        </Route>
        <Route path="/tickets" component={TicketList} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Switch>
              <Route path="/" component={PublicEntry} />
              <Route>
                <AuthGate>
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
