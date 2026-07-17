import React from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Ticket,
  UserCircle,
  Settings,
} from 'lucide-react';
import { useGetDashboardStats, getGetDashboardStatsQueryKey } from '@workspace/api-client-react';

// @ts-ignore
import gsbLogo from '@/assets/gsb-logo.jpg';

export function Sidebar() {
  const [location] = useLocation();
  // Refresco periódico para que el badge de nuevos funcione como notificación
  const { data: stats } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey(), refetchInterval: 30_000 },
  });

  const nuevosSinAbrir =
    stats?.por_estado?.find((e) => e.estado === 'nuevo')?.cantidad ?? 0;

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/tickets', label: 'Tickets', icon: Ticket },
    { href: '/admin', label: 'Administración', icon: Settings },
  ];

  return (
    <div className="w-[240px] bg-sidebar text-sidebar-foreground flex flex-col h-screen flex-shrink-0 border-r border-sidebar-border">
      {/* Top Section - Logo */}
      <div className="h-20 flex items-center px-6 border-b border-sidebar-border/50 flex-shrink-0 flex-col justify-center items-start pt-2">
        <img 
          src={gsbLogo} 
          alt="GSB Logo" 
          className="h-8 object-contain" 
          style={{ filter: 'brightness(0) invert(1)' }} 
        />
        <div className="mt-1 text-[9px] uppercase tracking-widest text-sidebar-foreground/60 font-semibold">
          Sistema de Tickets
        </div>
      </div>

      {/* Middle Section - Nav */}
      <div className="flex-1 overflow-y-auto py-6">
        <nav className="space-y-1.5 px-3">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location === link.href ||
                            (link.href !== '/' && location.startsWith(link.href));

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-all ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary border-l-2 border-sidebar-primary -ml-[2px] pl-[14px]'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
                data-testid={`nav-link-${link.label.toLowerCase().replace(' ', '-')}`}
              >
                <div className="flex items-center">
                  <Icon className={`mr-3 h-[18px] w-[18px] flex-shrink-0 ${isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground'}`} />
                  {link.label}
                </div>
                
                {/* Notificaciones: nuevos sin abrir (ámbar) y vencidos (rojo) */}
                {link.href === '/tickets' && (
                  <span className="flex items-center gap-1.5">
                    {nuevosSinAbrir > 0 && (
                      <span
                        className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold"
                        title={`${nuevosSinAbrir} tickets nuevos sin abrir`}
                      >
                        {nuevosSinAbrir}
                      </span>
                    )}
                    {stats?.vencidos && stats.vencidos > 0 ? (
                      <span
                        className="bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full text-[10px] font-bold"
                        title={`${stats.vencidos} tickets vencidos`}
                      >
                        {stats.vencidos}
                      </span>
                    ) : null}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Metrics Section */}
      <div className="px-5 py-5 border-t border-sidebar-border/50">
        <h3 className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-semibold mb-3">
          Estado Actual
        </h3>
        <div className="space-y-2.5">
          <div className="flex justify-between items-center text-sm">
            <span className="text-sidebar-foreground/80">Total</span>
            <span className="font-semibold">{stats?.total || 0}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-sidebar-foreground/80">En proceso</span>
            <span className="font-semibold text-blue-400">
              {stats?.por_estado?.find((e: any) => e.estado === 'en_proceso')?.cantidad || 0}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-sidebar-foreground/80">Pendientes</span>
            <span className="font-semibold text-amber-400">
              {stats?.por_estado?.find((e: any) => e.estado === 'pendiente')?.cantidad || 0}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-sidebar-foreground/80">Urgentes</span>
            <span className="font-semibold text-red-400">
              {stats?.por_prioridad?.find((p: any) => p.prioridad === 'urgente')?.cantidad || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border/50 bg-sidebar-accent/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-sidebar-border flex items-center justify-center flex-shrink-0">
            <UserCircle className="h-5 w-5 text-sidebar-foreground/70" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">GSB IT - V0.1</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col bg-background">
        {children}
      </main>
    </div>
  );
}
