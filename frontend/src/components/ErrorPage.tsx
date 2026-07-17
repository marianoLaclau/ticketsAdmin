import React from 'react';
import {
  AlertTriangle,
  FileQuestion,
  House,
  RefreshCw,
  ServerCrash,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type ErrorCopy = {
  title: string;
  message: string;
  icon: React.ComponentType<{ className?: string }>;
};

const ERROR_COPY: Record<number, ErrorCopy> = {
  401: {
    title: 'Necesitás iniciar sesión',
    message: 'Tu sesión venció o todavía no ingresaste al sistema.',
    icon: ShieldAlert,
  },
  403: {
    title: 'Acceso denegado',
    message: 'Tu usuario no tiene permisos para acceder a esta sección.',
    icon: ShieldAlert,
  },
  404: {
    title: 'Página no encontrada',
    message: 'La página que buscás no existe o cambió de ubicación.',
    icon: FileQuestion,
  },
  409: {
    title: 'No se pudo completar la acción',
    message: 'La información cambió o entra en conflicto con otro registro. Actualizá los datos e intentá nuevamente.',
    icon: AlertTriangle,
  },
  500: {
    title: 'Ocurrió un error inesperado',
    message: 'No pudimos completar la solicitud. Intentá nuevamente en unos instantes.',
    icon: ServerCrash,
  },
  503: {
    title: 'Servicio no disponible',
    message: 'No pudimos conectarnos con el servicio. Revisá la conexión e intentá nuevamente.',
    icon: WifiOff,
  },
};

const DEFAULT_ERROR: ErrorCopy = {
  title: 'No pudimos completar la solicitud',
  message: 'Ocurrió un problema inesperado. Volvé al inicio o intentá nuevamente.',
  icon: AlertTriangle,
};

const APP_BASE_URL = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export type ErrorPageProps = {
  status?: number;
  title?: string;
  message?: string;
  homeHref?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
};

/** Obtiene un status HTTP sin acoplar la UI a una implementación de cliente. */
export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;

  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  if ('response' in error) {
    const response = error.response;
    if (response && typeof response === 'object' && 'status' in response && typeof response.status === 'number') {
      return response.status;
    }
  }

  return undefined;
}

export function ErrorPage({
  status,
  title,
  message,
  homeHref = `${APP_BASE_URL}dashboard`,
  onRetry,
  isRetrying = false,
}: ErrorPageProps) {
  const normalizedStatus = status && status >= 500 && status !== 503 ? 500 : status;
  const copy = (normalizedStatus && ERROR_COPY[normalizedStatus]) || DEFAULT_ERROR;
  const Icon = copy.icon;

  return (
    <main className="min-h-screen w-full bg-background px-4 py-10 flex items-center justify-center">
      <Card className="w-full max-w-lg border-border/80 shadow-lg">
        <CardContent className="px-6 py-10 text-center sm:px-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <Icon className="h-8 w-8 text-destructive" />
          </div>

          {status ? (
            <p className="mb-2 text-sm font-semibold tracking-widest text-muted-foreground">
              ERROR {status}
            </p>
          ) : null}

          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            {title || copy.title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
            {message || copy.message}
          </p>

          <div className="mt-8 flex flex-col-reverse justify-center gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <a href={homeHref}>
                <House />
                Volver al inicio
              </a>
            </Button>
            {onRetry ? (
              <Button type="button" onClick={onRetry} disabled={isRetrying}>
                <RefreshCw className={isRetrying ? 'animate-spin' : undefined} />
                {isRetrying ? 'Reintentando…' : 'Reintentar'}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

/** Último recurso para errores de render que React no puede recuperar. */
export class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error de render no controlado', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorPage status={500} onRetry={() => window.location.reload()} />;
    }

    return this.props.children;
  }
}
