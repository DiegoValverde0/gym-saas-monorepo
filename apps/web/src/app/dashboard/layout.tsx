"use client";

import { ReactNode, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useModulosActivos } from '@/hooks/use-modulos-activos';
import { apiGet, unwrapList } from '@/lib/api-client';
import { esPantallaActual, GrupoVisible, INICIO, menuVisible } from '@/lib/navegacion';
import { LayoutDashboard, LogOut, Menu, Dumbbell, Globe, ChevronDown, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AvisosParaEnviar } from '@/components/ui/avisos-para-enviar';
import { CommandPalette } from '@/components/ui/command-palette';
import { nombreRol } from '@/lib/roles';
import { Recorrido, reiniciarRecorridos } from '@/components/ui/recorrido';
import { AsistenteInicio } from '@/components/ui/asistente-inicio';
import { useModoUso } from '@/hooks/use-modo-uso';
import { IndicadorAlcance, SelectorSucursal, useAvisoCambioAcceso } from '@/components/ui/indicador-alcance';
import { MarcajeTurno } from '@/components/ui/marcaje-turno';

const SUPERADMIN_GROUP = 'SuperAdmin' as const;
const DASHBOARD_GROUP = 'Dashboard' as const;
type ActiveGroup = GrupoVisible | typeof SUPERADMIN_GROUP | typeof DASHBOARD_GROUP;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeTenantId, setActiveTenantId } = useTenantStore();
  const { permisos } = usePermissions();
  const { token, user: userData, isSuperAdmin, logout } = useAuth();
  useAvisoCambioAcceso(userData);
  // Las cuentas de clientes usan su portal, no el panel.
  const esCliente = !!userData?.esCliente;
  useEffect(() => {
    if (esCliente) router.replace('/portal');
  }, [esCliente, router]);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const { data: organizaciones } = useQuery({
    queryKey: ['organizaciones'],
    queryFn: async () => unwrapList(await apiGet('/organizaciones')),
    enabled: isSuperAdmin && !!token,
  });

  const modulos = useModulosActivos();
  const { modo, esSimple } = useModoUso();

  // Qué ve esta persona (docs/plan-menu-lateral.md): permisos, módulos y modo.
  const filteredNavigationGroups = useMemo(() => menuVisible({ permisos, modulos, modo }), [permisos, modulos, modo]);

  // Active Group logic
  const activeGroup: ActiveGroup = useMemo(() => {
    if (pathname === '/dashboard/organizaciones') return SUPERADMIN_GROUP;
    if (pathname === '/dashboard') return DASHBOARD_GROUP;
    for (const group of filteredNavigationGroups) {
      if (group.pantallas.some((p) => esPantallaActual(pathname, p.href))) {
        return group;
      }
    }
    return filteredNavigationGroups[0] ?? DASHBOARD_GROUP;
  }, [pathname, filteredNavigationGroups]);

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setActiveTenantId(val === 'all' ? null : val);
    queryClient.invalidateQueries();
    router.refresh();
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="flex h-16 shrink-0 items-center px-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-sm">
            <Dumbbell className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Gym<span className="text-indigo-600 dark:text-indigo-400 font-normal">Manager</span>
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6 space-y-1">
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-4 ${
            activeGroup === DASHBOARD_GROUP
              ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <LayoutDashboard className={`h-4 w-4 ${activeGroup === DASHBOARD_GROUP ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
          {INICIO.nombre}
        </Link>

        {isSuperAdmin && (
          <div className="mb-4">
            <p className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Sistema</p>
            <Link
              href="/dashboard/organizaciones"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeGroup === SUPERADMIN_GROUP
                  ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Globe className={`h-4 w-4 ${activeGroup === SUPERADMIN_GROUP ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
              Organizaciones
            </Link>
          </div>
        )}

        <p className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 mt-4">Módulos</p>
        
        {filteredNavigationGroups.map((group) => {
          // El grupo lleva a su primera página visible (menuVisible ya quitó las demás).
          const primeraVisible = group.pantallas[0];
          const isActive = activeGroup !== SUPERADMIN_GROUP && activeGroup !== DASHBOARD_GROUP && activeGroup.titulo === group.titulo;

          return (
            <div key={group.titulo}>
              <Link
                href={primeraVisible.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <group.icono className={`h-4 w-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                {group.titulo}
              </Link>

              {/* Desglose del grupo activo: en escritorio ya se ve en el topbar
                  (hidden md:flex más abajo), pero el topbar no existe en móvil,
                  así que lo repetimos aquí para no dejar ese menú sin salida. */}
              {isActive && (
                <div className="md:hidden mt-1 ml-4 pl-3 border-l border-slate-200 dark:border-slate-800 space-y-0.5">
                  {group.pantallas.map((item) => {
                    const isItemActive = esPantallaActual(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isItemActive
                            ? 'text-indigo-700 dark:text-indigo-300 font-semibold'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <item.icono className="h-3.5 w-3.5" />
                        {item.nombre}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (esCliente) return <div className="h-screen w-full bg-slate-50 dark:bg-slate-900" />;

  // Clases print:*: al imprimir (Reportería) sale solo el contenido, entero,
  // sin menú ni barra superior.
  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900 print:block print:h-auto print:bg-white">
      {/* Sidebar Desktop */}
      <div className="hidden md:flex md:w-[240px] md:flex-col md:fixed md:inset-y-0 z-40 print:!hidden">
        <SidebarContent />
      </div>

      <div className="flex flex-col flex-1 md:pl-[240px] h-full overflow-hidden print:block print:h-auto print:overflow-visible print:pl-0">
        {/* Top App Bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 shadow-xs print:hidden">
          <div className="flex items-center gap-4 flex-1">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden text-slate-500 dark:text-slate-400">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[260px]">
                <SidebarContent />
              </SheetContent>
            </Sheet>

            {/* Sub-module Tabs */}
            <div className="hidden md:flex items-center gap-1">
              {activeGroup !== SUPERADMIN_GROUP && activeGroup !== DASHBOARD_GROUP && activeGroup.pantallas.map((item) => {
                const isActive = esPantallaActual(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                      isActive
                        ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    {item.nombre}
                  </Link>
                );
              })}
              {activeGroup === SUPERADMIN_GROUP && (
                <span className="px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                  SuperAdmin / Organizaciones
                </span>
              )}
              {activeGroup === DASHBOARD_GROUP && (
                <span className="px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                  {INICIO.nombre}
                </span>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {/* Global Context Selector (Tenant) */}
            {isSuperAdmin && organizaciones ? (
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1 pr-2">
                <div className="bg-white dark:bg-slate-900 p-1 rounded border border-slate-200 dark:border-slate-800 shadow-xs text-slate-500 dark:text-slate-400">
                  <Globe className="w-4 h-4" />
                </div>
                <select
                  value={activeTenantId || 'all'}
                  onChange={handleTenantChange}
                  className="bg-transparent border-none text-xs font-semibold text-slate-700 dark:text-slate-300 focus:ring-0 cursor-pointer py-1 max-w-[150px] truncate outline-none"
                >
                  <option value="all">Ver todo el sistema</option>
                  {(organizaciones as any[]).map((org: { id: string; nombre: string }) => (
                    <option key={org.id} value={org.id}>{org.nombre}</option>
                  ))}
                </select>
              </div>
            ) : (
              userData && !isSuperAdmin && (
                <div className="hidden md:flex items-center gap-2">
                  {userData.organizacionNombre && (
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-md px-2.5 py-1 text-xs font-semibold">
                      <Globe className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                      <span className="truncate max-w-[120px]">{userData.organizacionNombre}</span>
                    </div>
                  )}
                  <SelectorSucursal />
                  <IndicadorAlcance user={userData} />
                </div>
              )
            )}

            {/* Marcaje del equipo (plan 7.4): visible también en el celular. */}
            <MarcajeTurno />

            {/* Avisos automáticos por WhatsApp (dueño y recepción). */}
            <AvisosParaEnviar />

            <ThemeToggle />

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="flex items-center gap-2 p-1 pr-2 rounded-full border border-transparent hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-800 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-sm">
                  {userData?.nombre?.charAt(0).toUpperCase() || userData?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[100px]">
                    {userData?.nombre || userData?.email?.split('@')[0] || 'Usuario'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {isSuperAdmin ? 'SuperAdmin' : nombreRol(userData?.rolNombre) || 'Staff'}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 ml-1" />
              </button>

              {profileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileMenuOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg z-50 py-1">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{userData?.nombre}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{userData?.email}</p>
                    </div>
                    <div className="py-1">
                      {esSimple && userData?.sub && (
                        <button
                          onClick={() => { setProfileMenuOpen(false); reiniciarRecorridos(userData.sub); }}
                          className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                        >
                          <Lightbulb className="w-4 h-4" />
                          Volver a ver las guías
                        </button>
                      )}
                      <button
                        onClick={logout}
                        className="w-full text-left px-4 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/20 flex items-center gap-2 transition-colors font-medium"
                      >
                        <LogOut className="w-4 h-4" />
                        Cerrar Sesión
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8 print:overflow-visible print:bg-white print:p-0">
          <div className="mx-auto max-w-7xl h-full">
            {children}
          </div>
          <CommandPalette />
          <AsistenteInicio />
          <Recorrido />
        </main>
      </div>
    </div>
  );
}
