import { useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Ticket,
  UsersRound,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminElevationAccess } from "@/hooks/use-admin-elevation";
import {
  getApiErrorStatus,
  getServerErrorCode,
  getUserErrorMessage,
} from "@/lib/error-messages";

export interface AdminHeaderProps {
  title: string;
  description: string;
  state: AdminElevationAccess["state"];
  expiresAt: AdminElevationAccess["expiresAt"];
  error: AdminElevationAccess["error"];
  action: AdminElevationAccess["action"];
  onElevate: AdminElevationAccess["elevate"];
  onRevoke: AdminElevationAccess["revoke"];
}

const adminLinks = [
  { href: "/admin", label: "Tickets", icon: Ticket },
  {
    href: "/admin/roles-usuarios",
    label: "Roles y usuarios",
    icon: UsersRound,
  },
];

function getElevationErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;

  switch (getApiErrorStatus(error)) {
    case 401:
      return getServerErrorCode(error) === "ADMIN_KEY_INVALID"
        ? "La clave de administración no es válida. Revisala e intentá nuevamente."
        : "Tu sesión venció o cambió. Volvé a iniciar sesión.";
    case 429:
      return "Se realizaron demasiados intentos. Esperá unos minutos antes de volver a probar.";
    case 503:
      return "El acceso administrativo no está disponible en este momento.";
    default:
      return getUserErrorMessage(
        error,
        "No pudimos habilitar el acceso administrativo. Intentá nuevamente.",
      );
  }
}

function formatExpiration(expiresAt: string): string {
  const expiration = new Date(expiresAt);
  if (Number.isNaN(expiration.getTime())) return "durante esta sesión";

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(expiration);
}

function PendingElevationStatus({
  action,
}: {
  action: AdminElevationAccess["action"];
}) {
  const message =
    action === "elevating"
      ? "Validando acceso administrativo..."
      : action === "revoking"
        ? "Revocando acceso administrativo..."
        : "Verificando acceso administrativo...";

  return (
    <div
      className="flex min-h-9 items-center gap-2 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Loader2
        className="h-4 w-4 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      {message}
    </div>
  );
}

export function AdminHeader({
  title,
  description,
  state,
  expiresAt,
  error,
  action,
  onElevate,
  onRevoke,
}: AdminHeaderProps) {
  const [location] = useLocation();
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const submissionLock = useRef(false);
  const revocationLock = useRef(false);
  const errorMessage = getElevationErrorMessage(error);

  const handleElevate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionLock.current || secret.trim().length === 0) return;

    submissionLock.current = true;
    setIsSubmitting(true);
    const submittedSecret = secret;
    setSecret("");
    setShowSecret(false);

    // El secreto deja el DOM antes de entregárselo al controlador. El salto de
    // microtarea permite que React confirme ese render antes de iniciar el POST.
    await Promise.resolve();

    try {
      await onElevate(submittedSecret);
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const elevateIsPending = isSubmitting || action === "elevating";
  const revokeIsPending = isRevoking || action === "revoking";

  const handleRevoke = async () => {
    if (revocationLock.current) return;

    revocationLock.current = true;
    setIsRevoking(true);
    try {
      await onRevoke();
    } finally {
      revocationLock.current = false;
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Database className="h-6 w-6 text-primary" aria-hidden="true" />
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="w-full space-y-2 md:w-[340px]">
          {state === "pending" ? (
            <PendingElevationStatus action={action} />
          ) : state === "ready" ? (
            <div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <div
                className="flex items-start gap-2 text-sm font-medium"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Acceso administrativo habilitado
                  {expiresAt !== null
                    ? ` hasta ${formatExpiration(expiresAt)}`
                    : null}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-end border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                onClick={() => void handleRevoke()}
                disabled={revokeIsPending}
              >
                Revocar acceso
              </Button>
            </div>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(event) => void handleElevate(event)}
            >
              <Label htmlFor="admin-elevation-secret" className="sr-only">
                Clave de administración
              </Label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <KeyRound
                    className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="admin-elevation-secret"
                    type={showSecret ? "text" : "password"}
                    placeholder="Clave de administración"
                    className="h-9 pl-8 pr-10 text-sm"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby={`admin-elevation-help${errorMessage !== null ? " admin-elevation-error" : ""}`}
                    aria-invalid={errorMessage !== null || undefined}
                    disabled={elevateIsPending}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((visible) => !visible)}
                    className="absolute right-1 top-1/2 flex h-7 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={
                      showSecret
                        ? "Ocultar clave de administración"
                        : "Mostrar clave de administración"
                    }
                    aria-pressed={showSecret}
                    title={showSecret ? "Ocultar clave" : "Mostrar clave"}
                    disabled={elevateIsPending}
                  >
                    {showSecret ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="h-9"
                  disabled={secret.trim().length === 0 || elevateIsPending}
                >
                  {elevateIsPending ? (
                    <Loader2
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : null}
                  Habilitar
                </Button>
              </div>
              <p
                id="admin-elevation-help"
                className="text-[11px] leading-snug text-muted-foreground"
              >
                La clave se usa una sola vez y no se guarda en este navegador.
              </p>
              {errorMessage !== null ? (
                <p
                  id="admin-elevation-error"
                  className="flex items-start gap-1.5 text-xs font-medium text-red-600"
                  role="alert"
                >
                  <XCircle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {errorMessage}
                </p>
              ) : null}
            </form>
          )}
        </div>
      </div>

      <nav
        className="flex flex-wrap gap-2"
        aria-label="Secciones de administración"
      >
        {adminLinks.map((link) => {
          const Icon = link.icon;
          const active = location === link.href;
          return (
            <Button
              key={link.href}
              asChild
              variant={active ? "default" : "outline"}
              size="sm"
            >
              <Link href={link.href} aria-current={active ? "page" : undefined}>
                <Icon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {link.label}
              </Link>
            </Button>
          );
        })}
      </nav>
    </div>
  );
}
