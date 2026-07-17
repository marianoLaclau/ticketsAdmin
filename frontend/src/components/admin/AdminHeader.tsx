import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { CheckCircle2, Database, Eye, EyeOff, KeyRound, Loader2, Ticket, UsersRound, XCircle } from 'lucide-react';
import { useListAdminRoles } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AdminHeaderProps {
  title: string;
  description: string;
  adminKey: string;
  onAdminKeyChange: (value: string) => void;
}

const adminLinks = [
  { href: '/admin', label: 'Tickets', icon: Ticket },
  {
    href: '/admin/roles-usuarios',
    label: 'Roles y usuarios',
    icon: UsersRound,
  },
];

let adminKeyProbeVersion = 0;

function nextAdminKeyProbeVersion(): number {
  adminKeyProbeVersion += 1;
  return adminKeyProbeVersion;
}

/**
 * Verifica en vivo si la llave de administración habilita el acceso,
 * haciendo una consulta mínima a la API con la llave actual.
 */
function EstadoLlave({ adminKey }: { adminKey: string }) {
  // La clave nunca debe formar parte del query key: React Query conserva esos
  // identificadores en memoria y puede exponerlos en herramientas de desarrollo.
  const probeVersion = useMemo(nextAdminKeyProbeVersion, [adminKey]);
  const probe = useListAdminRoles(
    { page: 1, limit: 1 },
    {
      query: {
        queryKey: ['admin-key-probe', probeVersion],
        retry: false,
        refetchOnWindowFocus: false,
      },
      request: adminKey ? { headers: { 'x-admin-key': adminKey } } : {},
    },
  );

  if (probe.isLoading) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Verificando llave...
      </span>
    );
  }
  if (probe.isSuccess) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Llave activa — acceso habilitado
      </span>
    );
  }
  const status = (probe.error as { status?: number } | null)?.status;
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-red-600">
      <XCircle className="h-3 w-3" />
      {status === 401
        ? adminKey
          ? 'Llave inválida — verificala'
          : 'Falta la llave de administración'
        : status === 503
          ? 'ADMIN_API_KEY no está configurada en el servidor'
        : 'Sin acceso — verificá la conexión'}
    </span>
  );
}

export function AdminHeader({ title, description, adminKey, onAdminKeyChange }: AdminHeaderProps) {
  const [location] = useLocation();
  const [showAdminKey, setShowAdminKey] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Database className="h-6 w-6 text-primary" />
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="w-full space-y-1 md:w-[300px]">
          <div className="relative">
            <KeyRound className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type={showAdminKey ? 'text' : 'password'}
              placeholder="Llave de administración"
              className="h-9 pl-8 pr-10 text-sm"
              value={adminKey}
              onChange={(event) => onAdminKeyChange(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowAdminKey((visible) => !visible)}
              className="absolute right-1 top-1/2 flex h-7 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showAdminKey ? 'Ocultar llave de administración' : 'Mostrar llave de administración'}
              aria-pressed={showAdminKey}
              title={showAdminKey ? 'Ocultar llave' : 'Mostrar llave'}
            >
              {showAdminKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <EstadoLlave adminKey={adminKey} />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Segunda verificación para operar el panel. Se recuerda para tu usuario en este navegador.
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Secciones de administración">
        {adminLinks.map((link) => {
          const Icon = link.icon;
          const active = location === link.href;
          return (
            <Button key={link.href} asChild variant={active ? 'default' : 'outline'} size="sm">
              <Link href={link.href}>
                <Icon className="mr-1.5 h-4 w-4" />
                {link.label}
              </Link>
            </Button>
          );
        })}
      </nav>
    </div>
  );
}
