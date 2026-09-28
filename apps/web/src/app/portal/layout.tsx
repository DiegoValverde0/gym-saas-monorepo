"use client";

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { CalendarDays, History, Home, UserRound } from 'lucide-react';
import { useYo } from './datos';

/**
 * Portal del cliente (docs/plan-portal-cliente.md, fase 3): pensado para el
 * celular, sin el menú del panel. Solo para cuentas de clientes: el equipo
 * vuelve al panel.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const esCliente = !!user?.esCliente;
  const { data: yo } = useYo(esCliente);

  useEffect(() => {
    if (user && !user.esCliente) router.replace('/dashboard');
  }, [user, router]);

  if (!esCliente) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950" />;
  }

  const pestanas = [
    { href: '/portal', nombre: 'Inicio', icono: Home },
    ...(yo?.clasesActivas ? [{ href: '/portal/clases', nombre: 'Clases', icono: CalendarDays }] : []),
    { href: '/portal/asistencias', nombre: 'Asistencias', icono: History },
    { href: '/portal/cuenta', nombre: 'Cuenta', icono: UserRound },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <p className="truncate font-semibold">{yo?.gimnasio ?? user?.organizacionNombre ?? 'Mi gimnasio'}</p>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-28 pt-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900">
        <ul className="mx-auto flex max-w-xl">
          {pestanas.map(({ href, nombre, icono: Icono }) => {
            const activa = href === '/portal' ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={activa ? 'page' : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                    activa ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icono className="h-5 w-5" />
                  {nombre}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
