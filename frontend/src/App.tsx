import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Dashboard from '@/pages/Dashboard';
import TicketList from '@/pages/TicketList';
import TicketDetail from '@/pages/TicketDetail';
import Admin from '@/pages/Admin';
import AdminRolesUsers from '@/pages/AdminRolesUsers';
import Login from '@/pages/Login';
import NotFound from '@/pages/not-found';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Loader2 } from 'lucide-react';
import { ROL_SYSADMIN } from '@/lib/roles';

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
      if (!esQueryDeSesion && (error as { status?: number })?.status === 401) {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
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
  if (me?.rol !== ROL_SYSADMIN) return <NotFound />;
  return <>{children}</>;
}

/**
 * Candado de toda la aplicación: sin sesión válida no se renderiza NINGUNA
 * pantalla — cualquier URL muestra el login. La URL original se conserva,
 * así que después de loguearse el usuario cae donde quería ir.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false, refetchOnWindowFocus: true },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white/60 animate-spin" />
      </div>
    );
  }

  if (!me) return <Login />;

  return <>{children}</>;
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/admin/roles-usuarios">
          <SoloSysAdmin><AdminRolesUsers /></SoloSysAdmin>
        </Route>
        <Route path="/admin">
          <SoloSysAdmin><Admin /></SoloSysAdmin>
        </Route>
        <Route path="/tickets/:id" component={TicketDetail} />
        <Route path="/tickets" component={TicketList} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthGate>
            <Router />
          </AuthGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
