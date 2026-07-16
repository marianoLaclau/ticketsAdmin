import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Dashboard from '@/pages/Dashboard';
import TicketList from '@/pages/TicketList';
import TicketDetail from '@/pages/TicketDetail';
import NewTicket from '@/pages/NewTicket';
import NotFound from '@/pages/not-found';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/tickets/nuevo" component={NewTicket} />
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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
