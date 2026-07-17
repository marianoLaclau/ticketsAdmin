import { Link, useLocation } from 'wouter';
import { Database, KeyRound, Ticket, UsersRound } from 'lucide-react';
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

export function AdminHeader({ title, description, adminKey, onAdminKeyChange }: AdminHeaderProps) {
  const [location] = useLocation();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Database className="h-6 w-6 text-primary" />
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="relative w-full md:w-[280px]">
          <KeyRound className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="password"
            placeholder="Clave de administración (si aplica)"
            className="h-9 pl-8 text-sm"
            value={adminKey}
            onChange={(event) => onAdminKeyChange(event.target.value)}
            autoComplete="current-password"
          />
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
