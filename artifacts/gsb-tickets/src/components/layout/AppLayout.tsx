import React from 'react';
import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, 
  Ticket, 
  PlusCircle, 
  PhoneCall 
} from 'lucide-react';
// @ts-ignore
import gsbLogo from '@assets/GSB-Logo_1784207758364.jpg';

export function Sidebar() {
  const [location] = useLocation();

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/tickets', label: 'Tickets', icon: Ticket },
    { href: '/tickets/nuevo', label: 'Nuevo Ticket', icon: PlusCircle },
  ];

  return (
    <div className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col shadow-sm flex-shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-100 flex-shrink-0 py-2">
        <img src={gsbLogo} alt="GSB Logo" className="h-full object-contain" />
      </div>
      <div className="flex-1 overflow-y-auto py-6">
        <nav className="space-y-1 px-4">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location === link.href || 
                            (link.href !== '/' && location.startsWith(link.href) && link.href !== '/tickets/nuevo' && location !== '/tickets/nuevo') || 
                            (link.href === '/tickets/nuevo' && location === '/tickets/nuevo');
                            
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                data-testid={`nav-link-${link.label.toLowerCase().replace(' ', '-')}`}
              >
                <Icon className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <PhoneCall className="h-4 w-4 text-slate-500" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-900">GSB Quality Services</p>
            <p className="text-xs text-slate-500">Quality Management</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
