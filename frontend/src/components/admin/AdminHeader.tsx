import { Link, useLocation } from "wouter";
import { Ticket, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AdminHeaderProps {
  title: string;
  description: string;
}

const adminLinks = [
  { href: "/admin", label: "Tickets", icon: Ticket },
  {
    href: "/admin/roles-usuarios",
    label: "Roles y usuarios",
    icon: UsersRound,
  },
];

/**
 * Encabezado de las pantallas de administración.
 *
 * Antes hospedaba el formulario de la llave administrativa: una segunda
 * verificación que expiraba y había que reingresar. Esa capa se retiró y el
 * rol SysAdmin de la sesión es ahora la única frontera de acceso, validada
 * de forma independiente por el backend.
 */
export function AdminHeader({ title, description }: AdminHeaderProps) {
  const [location] = useLocation();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
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
