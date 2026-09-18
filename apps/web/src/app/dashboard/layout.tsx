"use client";

import { ReactNode, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useModulosActivos } from '@/hooks/use-modulos-activos';
import { apiGet, unwrapList } from '@/lib/api-client';
import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  Settings,
  Users,
  LogOut,
  Wallet,
  Menu,
  Dumbbell,
  Globe,
  Briefcase,
  Tag,
  IdCard,
  ScanFace,
  Landmark,
  ChevronDown,
  Banknote,
  FileText,
  Activity,
  Package,
  ClipboardList,
  UserCog,
  Clock,
  CalendarDays,
  Receipt,
  Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { CommandPalette } from '@/components/ui/command-palette';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

interface NavGroup {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  baseHref: string;
  items: NavItem[];
}

const navigationGroups: NavGroup[] = [
  {
    title: 'Operaciones',
    icon: Activity,
    baseHref: '/dashboard/clientes',
    items: [
      { name: 'Clientes', href: '/dashboard/clientes', icon: Users, permission: 'clientes:leer' },
      { name: 'Asistencias', href: '/dashboard/asistencias', icon: ScanFace, permission: 'asistencias:leer' }
    ]
  },
  {
    title: 'Comercial',
    icon: Tag,
    baseHref: '/dashboard/planes',
    items: [
      { name: 'Planes', href: '/dashboard/planes', icon: Briefcase, permission: 'planes:leer' },
      { name: 'Promociones', href: '/dashboard/promociones', icon: Tag, permission: 'promociones:leer' },
      { name: 'Membresías', href: '/dashboard/membresias', icon: IdCard, permission: 'membresias:leer' },
      { name: 'Productos', href: '/dashboard/productos', icon: Package, permission: 'productos:leer' }
    ]
  },
  {
    title: 'Personal',
    icon: Dumbbell,
    baseHref: '/dashboard/disciplinas',
    items: [
      { name: 'Disciplinas', href: '/dashboard/disciplinas', icon: ClipboardList, permission: 'disciplinas:leer' },
      { name: 'Personal', href: '/dashboard/personal', icon: UserCog, permission: 'staff:leer' },
      { name: 'Turnos', href: '/dashboard/turnos', icon: Clock, permission: 'turnos:leer' },
      { name: 'Clases', href: '/dashboard/clases', icon: CalendarDays, permission: 'clases:leer' }
    ]
  },
  {
    title: 'Finanzas',
    icon: Wallet,
    baseHref: '/dashboard/reportes',
    items: [
      { name: 'Reportes Diarios', href: '/dashboard/reportes', icon: FileText },
      { name: 'Transacciones', href: '/dashboard/transacciones', icon: Banknote, permission: 'transacciones:leer' },
      { name: 'Gastos', href: '/dashboard/gastos', icon: Receipt, permission: 'transacciones:leer' },
      { name: 'Proveedores', href: '/dashboard/proveedores', icon: Truck, permission: 'transacciones:leer' },
      { name: 'Cajas', href: '/dashboard/cajas', icon: Wallet, permission: 'cajas_registradoras:leer' },
      { name: 'Cuentas', href: '/dashboard/cuentas-bancarias', icon: Landmark, permission: 'cuentas_bancarias:leer' }
    ]
  },
  {
    title: 'Administración',
    icon: Settings,
    baseHref: '/dashboard/usuarios',
    items: [
      { name: 'Usuarios', href: '/dashboard/usuarios', icon: Users, permission: 'usuarios:leer' },
      { name: 'Roles', href: '/dashboard/roles', icon: ShieldCheck, permission: 'roles:leer' },
      { name: 'Sucursales', href: '/dashboard/sucursales', icon: Building2, permission: 'sucursales:leer' },
      { name: 'Configuración', href: '/dashboard/configuracion', icon: Settings }
    ]
  }
];

const SUPERADMIN_GROUP = 'SuperAdmin' as const;
const DASHBOARD_GROUP = 'Dashboard' as const;
type ActiveGroup = NavGroup | typeof SUPERADMIN_GROUP | typeof DASHBOARD_GROUP;

// El item "Dashboard" vive en '/dashboard', que es prefijo de TODAS las
// rutas del panel -- un match por prefijo ingenuo (`pathname.startsWith(href + '/')`)
// haría que ese item (y por lo tanto el grupo Operaciones) "ganara" en cualquier
// página del sistema. Se excluye ese caso especial del match por prefijo.
function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (item.href === '/dashboard') return false;
  return pathname.startsWith(`${item.href}/`);
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeTenantId, setActiveTenantId } = useTenantStore();
  const { hasPermission } = usePermissions();
  const { token, user: userData, isSuperAdmin, logout } = useAuth();

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const { data: organizaciones } = useQuery({
    queryKey: ['organizaciones'],
    queryFn: async () => unwrapList(await apiGet('/organizaciones')),
    enabled: isSuperAdmin && !!token,
  });

  const modulos = useModulosActivos();

  // Filter groups based on tenant configuration
  const filteredNavigationGroups = useMemo(() => {
    return navigationGroups.map(group => {
      return {
        ...group,
        items: group.items.filter(item => {
          if (['Cajas', 'Productos', 'Transacciones'].includes(item.name)) return modulos.puntoVenta;
          if (['Clases', 'Disciplinas'].includes(item.name)) return modulos.clasesGrupales;
          if (['Personal', 'Turnos', 'Asistencias'].includes(item.name)) return modulos.controlPersonal;
          if (['Reportes Diarios'].includes(item.name)) return modulos.reportesAvanzados;
          return true;
        })
      };
    }).filter(group => group.items.length > 0);
  }, [modulos]);

  // Active Group logic
  const activeGroup: ActiveGroup = useMemo(() => {
    if (pathname === '/dashboard/organizaciones') return SUPERADMIN_GROUP;
    if (pathname === '/dashboard') return DASHBOARD_GROUP;
    for (const group of filteredNavigationGroups) {
      if (group.items.some(item => isNavItemActive(pathname, item))) {
        return group;
      }
    }
    return filteredNavigationGroups.length > 0 ? filteredNavigationGroups[0] : navigationGroups[0];
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
          Dashboard
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
          const hasAccess = group.items.some(item => !item.permission || hasPermission(item.permission));
          if (!hasAccess) return null;

          const isActive = activeGroup !== SUPERADMIN_GROUP && activeGroup !== DASHBOARD_GROUP && activeGroup.title === group.title;

          return (
            <div key={group.title}>
              <Link
                href={group.baseHref}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <group.icon className={`h-4 w-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                {group.title}
              </Link>

              {/* Desglose del grupo activo: en escritorio ya se ve en el topbar
                  (hidden md:flex más abajo), pero el topbar no existe en móvil,
                  así que lo repetimos aquí para no dejar ese menú sin salida. */}
              {isActive && (
                <div className="md:hidden mt-1 ml-4 pl-3 border-l border-slate-200 dark:border-slate-800 space-y-0.5">
                  {group.items.map((item) => {
                    if (item.permission && !hasPermission(item.permission)) return null;
                    const isItemActive = isNavItemActive(pathname, item);
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isItemActive
                            ? 'text-indigo-700 dark:text-indigo-300 font-semibold'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.name}
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

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900">
      {/* Sidebar Desktop */}
      <div className="hidden md:flex md:w-[240px] md:flex-col md:fixed md:inset-y-0 z-40">
        <SidebarContent />
      </div>

      <div className="flex flex-col flex-1 md:pl-[240px] h-full overflow-hidden">
        {/* Top App Bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 shadow-xs">
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
              {activeGroup !== SUPERADMIN_GROUP && activeGroup !== DASHBOARD_GROUP && activeGroup.items.map((item) => {
                if (item.permission && !hasPermission(item.permission)) return null;
                const isActive = isNavItemActive(pathname, item);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                      isActive
                        ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    {item.name}
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
                  Dashboard
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
                  {userData.sucursalNombre && (
                    <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-100 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-md px-2.5 py-1 text-xs font-bold">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[120px]">{userData.sucursalNombre}</span>
                    </div>
                  )}
                </div>
              )
            )}

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
                    {isSuperAdmin ? 'SuperAdmin' : userData?.rolNombre || 'Staff'}
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
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl h-full">
            {children}
          </div>
          <CommandPalette />
        </main>
      </div>
    </div>
  );
}
