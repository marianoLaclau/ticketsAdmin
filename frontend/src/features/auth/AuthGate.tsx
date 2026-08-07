import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { ErrorPage, getErrorStatus } from "@/components/ErrorPage";
import { LoadingStatus } from "@/components/ui/loading-status";
import {
  PASSWORD_CHANGE_PATH,
  getAuthenticatedEntryPath,
} from "@/lib/password-change";
import {
  getConfirmedSessionUser,
  getSessionIdentityStatus,
  getSessionVerificationState,
} from "@/lib/session-state";

export interface SessionIdentityProps {
  acceptedUserId: number | null;
  onAcceptUserId: (userId: number) => void;
}

interface AuthGateProps extends SessionIdentityProps {
  children: ReactNode;
  onConfirmedSessionLoss: () => void;
  passwordChangeContent: ReactNode;
}

export function LoadingSession() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar">
      <Loader2
        className="h-8 w-8 animate-spin text-white/60 motion-reduce:animate-none"
        aria-hidden="true"
      />
      <LoadingStatus>Verificando sesión</LoadingStatus>
    </main>
  );
}

export function PausedSession({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorPage
      status={503}
      message="No pudimos verificar tu sesión porque no hay conexión disponible. Revisá tu conexión e intentá nuevamente."
      homeHref={import.meta.env.BASE_URL}
      onRetry={onRetry}
    />
  );
}

/**
 * Candado de toda la aplicación: sin sesión válida no se renderiza ninguna
 * pantalla protegida ni se toman decisiones con una identidad sin confirmar.
 */
export function AuthGate({
  acceptedUserId,
  children,
  onAcceptUserId,
  onConfirmedSessionLoss,
  passwordChangeContent,
}: AuthGateProps) {
  const sessionLossReportedRef = useRef(false);
  const [location, navigate] = useLocation();
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
      retry: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
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

  useEffect(() => {
    if (sessionVerificationState !== "settled") return;

    if (isError) {
      if (errorStatus === 401) {
        if (acceptedUserId !== null && !sessionLossReportedRef.current) {
          sessionLossReportedRef.current = true;
          onConfirmedSessionLoss();
        }
        if (location !== "/") navigate("/", { replace: true });
      }
      return;
    }

    if (!confirmedUser) {
      if (location !== "/") navigate("/", { replace: true });
      return;
    }

    if (identityStatus === "changed") {
      onAcceptUserId(confirmedUser.id);
      return;
    }

    if (identityStatus !== "accepted") return;
    const target = getAuthenticatedEntryPath(confirmedUser);
    const passwordChangeRequired = target === PASSWORD_CHANGE_PATH;
    if (passwordChangeRequired && location !== target) {
      navigate(target, { replace: true });
    } else if (!passwordChangeRequired && location === PASSWORD_CHANGE_PATH) {
      navigate(target, { replace: true });
    }
  }, [
    confirmedUser,
    acceptedUserId,
    errorStatus,
    identityStatus,
    isError,
    location,
    navigate,
    onAcceptUserId,
    onConfirmedSessionLoss,
    sessionVerificationState,
  ]);

  if (sessionVerificationState === "paused") {
    return <PausedSession onRetry={() => void refetch()} />;
  }

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
        isRetrying={sessionVerificationState === "verifying"}
      />
    );
  }

  if (
    sessionVerificationState === "verifying" ||
    !confirmedUser ||
    identityStatus !== "accepted"
  ) {
    return <LoadingSession />;
  }

  if (getAuthenticatedEntryPath(confirmedUser) === PASSWORD_CHANGE_PATH) {
    if (location !== PASSWORD_CHANGE_PATH) return <LoadingSession />;
    return <>{passwordChangeContent}</>;
  }
  if (location === PASSWORD_CHANGE_PATH) return <LoadingSession />;

  return <>{children}</>;
}
