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
import { accesosCelular, esPantallaActual, GrupoVisible, INICIO, menuVisible } from '@/lib/navegacion';
import { LayoutDashboard, LogOut, Menu, Dumbbell, Globe, ChevronDown, Lightbulb, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AvisosParaEnviar } from '@/components/ui/avisos-para-enviar';
import { abrirPaleta, CommandPalette } from '@/components/ui/command-palette';
import { nombreRol } from '@/lib/roles';
import { Recorrido, reiniciarRecorridos } from '@/components/ui/recorrido';
import { AsistenteInicio } from '@/components/ui/asistente-inicio';
import { useModoUso } from '@/hooks/use-modo-uso';
import { IndicadorAlcance, SelectorSucursal, useAvisoCambioAcceso } from '@/components/ui/indicador-alcance';
import { MarcajeTurno } from '@/components/ui/marcaje-turno';

type Icono = React.ComponentType<{ className?: string }>;

// Un enlace del menú. La pantalla actual se marca aquí y solo aquí. Con el
// menú achicado solo se ve el ícono y el nombre aparece al pasar el mouse.
function Enlace({ href, nombre, icono: Icono, actual, compacto = false }: { href: string; nombre: string; icono: Icono; actual: boolean; compacto?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={actual ? 'page' : undefined}
      title={compacto ? nombre : undefined}
      className={`flex items-center gap-3 rounded-lg py-1.5 text-sm font-medium transition-colors ${compacto ? 'justify-center px-0' : 'px-3'} ${
        actual
          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
      }`}
    >
      <Icono className={`h-4 w-4 shrink-0 ${actual ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
      <span className={compacto ? 'sr-only' : 'truncate'}>{nombre}</span>
    </Link>
  );
}

// Un grupo del menú: título (no se clica) y todas sus pantallas a la vista.
// Achicado, el título se cambia por una línea (y queda para los lectores de pantalla).
function Grupo({ grupo, pathname, compacto = false }: { grupo: GrupoVisible; pathname: string; compacto?: boolean }) {
  const id = `menu-${grupo.titulo.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <div role="group" aria-labelledby={id} className={compacto ? 'pt-2' : 'pt-4'}>
      {compacto && <div className="mx-2 mb-2 border-t border-slate-200 dark:border-slate-800" />}
      <p id={id} className={compacto ? 'sr-only' : 'px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500'}>
        {grupo.titulo}
      </p>
      <div className="space-y-0.5">
        {grupo.pantallas.map((p) => (
          <Enlace key={p.href} href={p.href} nombre={p.nombre} icono={p.icono} actual={esPantallaActual(pathname, p.href)} compacto={compacto} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeTenantId, setActiveTenantId } = useTenantStore();
  const { permisos, isFetched: permisosCargados } = usePermissions();
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
  const { modo, esSimple, cargado: configuracionCargada } = useModoUso();

  // Qué ve esta persona (docs/plan-menu-lateral.md): permisos, módulos y modo.
  // Hasta tener los permisos y la configuración del gimnasio no se arma: con
  // los valores por defecto aparecían por un instante pantallas que no le tocan.
  const menuListo = permisosCargados && configuracionCargada;
  const filteredNavigationGroups = useMemo(
    () => (menuListo ? menuVisible({ permisos, modulos, modo }) : []),
    [menuListo, permisos, modulos, modo],
  );

  // Ajustes va separado, abajo del todo.
  const gruposArriba = filteredNavigationGroups.filter((g) => !g.alFondo);
  const gruposAlFondo = filteredNavigationGroups.filter((g) => g.alFondo);

  // En el celular, el menú se cierra al ir a otra pantalla.
  const [menuAbierto, setMenuAbierto] = useState(false);
  useEffect(() => setMenuAbierto(false), [pathname]);

  // Barra inferior del celular (fase 4): Inicio, lo de recepción y "Menú".
  // No va en la tablet de marcaje, que queda abierta en recepción para el equipo.
  const accesos = useMemo(() => accesosCelular(filteredNavigationGroups), [filteredNavigationGroups]);
  const conBarraInferior = !esCliente && !pathname.startsWith('/dashboard/marcaje');
  // Avisa a lo que está fijo abajo (avisos, guías) para correrse hacia arriba (ver globals.css).
  useEffect(() => {
    if (!conBarraInferior) return;
    document.documentElement.setAttribute('data-barra-inferior', '');
    return () => document.documentElement.removeAttribute('data-barra-inferior');
  }, [conBarraInferior]);

  // La pantalla actual siempre a la vista en el menú (el del dueño en experto
  // no entra entero en una pantalla baja).
  useEffect(() => {
    document.querySelector('nav[aria-label="Menú principal"] [aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [pathname]);

  // Menú achicado a íconos (escritorio): se recuerda para cada persona en este navegador.
  const claveCompacto = userData?.sub ? `gym_menu_compacto:${userData.sub}` : null;
  const [compacto, setCompacto] = useState(false);
  // Se anima solo al apretar el botón, no al cargar la preferencia guardada.
  const [animar, setAnimar] = useState(false);
  useEffect(() => {
    if (!claveCompacto) return;
    try {
      // Sin preferencia guardada: achicado en tablets (menos de 1024 px), para
      // que el contenido tenga lugar; abierto en pantallas grandes.
      const guardado = localStorage.getItem(claveCompacto);
      setCompacto(guardado === null ? window.matchMedia('(max-width: 1023px)').matches : guardado === '1');
    } catch {
      // Sin almacenamiento (ventana privada): queda abierto.
    }
  }, [claveCompacto]);
  const alternarCompacto = () => {
    setAnimar(true);
    setCompacto((antes) => {
      try {
        if (claveCompacto) localStorage.setItem(claveCompacto, antes ? '0' : '1');
      } catch {
        // Sin almacenamiento: vale solo para esta visita.
      }
      return !antes;
    });
  };

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setActiveTenantId(val === 'all' ? null : val);
    queryClient.invalidateQueries();
    router.refresh();
  };

  // Se llama como función y no como componente (<Sidebar />): así no se
  // vuelve a montar en cada render y el menú conserva su scroll.
  const sidebar = (achicado: boolean, escritorio: boolean) => (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className={`flex h-16 shrink-0 items-center ${achicado ? 'justify-center' : 'px-6'}`}>
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-sm">
            <Dumbbell className="h-5 w-5 text-white" />
          </div>
          {!achicado && (
            <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Gym<span className="text-indigo-600 dark:text-indigo-400 font-normal">Manager</span>
            </span>
          )}
        </div>
      </div>

      {/* Menú (docs/plan-menu-lateral.md): todos los grupos abiertos, lo de
          todos los días arriba y Ajustes al fondo. */}
      <nav aria-label="Menú principal" aria-busy={!menuListo} className={`flex flex-1 flex-col overflow-y-auto pb-4 ${achicado ? 'px-2' : 'px-3'}`}>
        <Enlace href={INICIO.href} nombre={INICIO.nombre} icono={LayoutDashboard} actual={pathname === INICIO.href} compacto={achicado} />
        {isSuperAdmin && (
          <div className="pt-4">
            <p className={achicado ? 'sr-only' : 'px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500'}>Sistema</p>
            <Enlace href="/dashboard/organizaciones" nombre="Organizaciones" icono={Globe} actual={pathname === '/dashboard/organizaciones'} compacto={achicado} />
          </div>
        )}
        {!menuListo && (
          <div aria-hidden className="space-y-2 pt-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`h-6 animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-800 ${achicado ? 'mx-1' : 'mx-3'}`} />
            ))}
          </div>
        )}
        {gruposArriba.map((grupo) => (
          <Grupo key={grupo.titulo} grupo={grupo} pathname={pathname} compacto={achicado} />
        ))}
        {gruposAlFondo.length > 0 && (
          <div className="mt-auto pt-4">
            <div className={achicado ? '' : 'border-t border-slate-200 dark:border-slate-800'}>
              {gruposAlFondo.map((grupo) => (
                <Grupo key={grupo.titulo} grupo={grupo} pathname={pathname} compacto={achicado} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {escritorio && (
        <div className={`shrink-0 border-t border-slate-200 p-2 dark:border-slate-800 ${achicado ? 'flex justify-center' : ''}`}>
          <button
            type="button"
            onClick={alternarCompacto}
            title={achicado ? 'Agrandar el menú' : undefined}
            aria-label={achicado ? 'Agrandar el menú' : 'Achicar el menú'}
            className={`flex items-center gap-3 rounded-lg py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white ${achicado ? 'px-2' : 'w-full px-3'}`}
          >
            {achicado ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!achicado && 'Achicar el menú'}
          </button>
        </div>
      )}
    </div>
  );

  if (esCliente) return <div className="h-screen w-full bg-slate-50 dark:bg-slate-900" />;

  // Clases print:*: al imprimir (Reportería) sale solo el contenido, entero,
  // sin menú ni barra superior.
  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900 print:block print:h-auto print:bg-white">
      {/* Sidebar Desktop */}
      <div className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 z-40 print:!hidden ${animar ? 'transition-[width]' : ''} ${compacto ? 'md:w-[64px]' : 'md:w-[240px]'}`}>
        {sidebar(compacto, true)}
      </div>

      <div className={`flex flex-col flex-1 h-full ${animar ? 'transition-[padding]' : ''} ${compacto ? 'md:pl-[64px]' : 'md:pl-[240px]'} overflow-hidden print:block print:h-auto print:overflow-visible print:pl-0`}>
        {/* Top App Bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 shadow-xs print:hidden">
          <div className="flex items-center gap-4 flex-1">
            <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden text-slate-500 dark:text-slate-400" aria-label="Abrir el menú">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[260px]">
                {sidebar(false, false)}
              </SheetContent>
            </Sheet>

            {/* Buscar: abre la paleta de comandos (también con Ctrl+K). */}
            <button
              type="button"
              onClick={abrirPaleta}
              className="hidden w-full max-w-xs items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200 md:flex"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-left">Buscar…</span>
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">Ctrl K</kbd>
            </button>
            <Button variant="ghost" size="icon" className="md:hidden text-slate-500 dark:text-slate-400" onClick={abrirPaleta} aria-label="Buscar">
              <Search className="h-5 w-5" />
            </Button>
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
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8 max-md:pb-[calc(1.5rem+var(--barra-inferior,0px))] print:overflow-visible print:bg-white print:p-0">
          <div className="mx-auto max-w-7xl h-full">
            {children}
          </div>
          <CommandPalette />
          <AsistenteInicio />
          <Recorrido />
        </main>
      </div>

      {conBarraInferior && (
        <nav
          aria-label="Accesos rápidos"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden print:hidden"
        >
          <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${accesos.length + 2}, minmax(0, 1fr))` }}>
            {[{ href: INICIO.href, nombre: INICIO.nombre, icono: LayoutDashboard }, ...accesos].map((p) => {
              const actual = p.href === INICIO.href ? pathname === INICIO.href : esPantallaActual(pathname, p.href);
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={actual ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                    actual ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <p.icono className={`h-5 w-5 ${actual ? 'text-indigo-600 dark:text-indigo-400' : ''}`} />
                  <span className="max-w-full truncate px-1">{p.nombre}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir el menú completo"
              className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              <Menu className="h-5 w-5" />
              <span>Menú</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
