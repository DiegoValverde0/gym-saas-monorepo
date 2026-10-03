import type { ComponentType } from 'react';
import {
  Banknote,
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock,
  Dumbbell,
  FileText,
  IdCard,
  KeyRound,
  Landmark,
  Package,
  PieChart,
  Receipt,
  ScanFace,
  Settings,
  ShieldCheck,
  Store,
  Sun,
  Tablet,
  Tag,
  Truck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import type { ModulosConfig } from '@/hooks/use-modulos-activos';
import type { ModoUso } from '@/hooks/use-modo-uso';

// El menú del panel (docs/plan-menu-lateral.md): una sola definición para el
// sidebar, el menú del celular y la paleta de comandos. Qué ve cada persona
// lo decide `menuVisible`, con sus permisos, los módulos del gimnasio y el
// modo de uso. Las rutas no cambian aunque cambien los nombres.

type Icono = ComponentType<{ className?: string }>;

export interface ContextoMenu {
  permisos: readonly string[];
  modulos: ModulosConfig;
  modo: ModoUso;
}

interface PantallaMenu {
  nombre: string;
  /** Otro nombre en algún modo (Reportería en simple: solo hay plantillas). */
  nombrePorModo?: Partial<Record<ModoUso, string>>;
  href: string;
  icono: Icono;
  /** Permiso que exige (el mismo que pide la API para leer). */
  permiso?: string;
  /** Módulo del gimnasio que tiene que estar encendido. */
  modulo?: keyof ModulosConfig;
  /** Modo de uso mínimo para mostrarla (plan de simplificación, 4.4). */
  modoMinimo?: ModoUso;
  /** Regla que no entra en los campos de arriba. */
  visible?: (ctx: ContextoMenu) => boolean;
  /** Otros nombres con los que se busca (los de antes, sinónimos). */
  alias?: string[];
}

interface GrupoMenu {
  titulo: string;
  icono: Icono;
  pantallas: PantallaMenu[];
  /** Va separado, abajo del todo (Ajustes). */
  alFondo?: boolean;
}

export const INICIO = { nombre: 'Inicio', href: '/dashboard', alias: ['dashboard', 'panel'] } as const;

const NIVEL: Record<ModoUso, number> = { simple: 0, intermedio: 1, experto: 2 };
const alMenos = (ctx: ContextoMenu, minimo: ModoUso) => NIVEL[ctx.modo] >= NIVEL[minimo];
const puede = (ctx: ContextoMenu, permiso: string) => ctx.permisos.includes(permiso);

// En cada grupo, lo más usado primero.
export const GRUPOS_MENU: GrupoMenu[] = [
  {
    titulo: 'Día a día',
    icono: Sun,
    pantallas: [
      { nombre: 'Asistencias', href: '/dashboard/asistencias', icono: ScanFace, permiso: 'asistencias:leer', modulo: 'controlAcceso', alias: ['control de acceso', 'ingresos', 'entradas'] },
      { nombre: 'Clientes', href: '/dashboard/clientes', icono: Users, permiso: 'clientes:leer', alias: ['socios', 'miembros'] },
      { nombre: 'Membresías', href: '/dashboard/membresias', icono: IdCard, permiso: 'membresias:leer', alias: ['renovaciones'] },
      { nombre: 'Caja', href: '/dashboard/cajas', icono: Wallet, permiso: 'cajas_registradoras:leer', modulo: 'puntoVenta', modoMinimo: 'intermedio', alias: ['cajas', 'abrir caja', 'cerrar caja'] },
    ],
  },
  {
    titulo: 'Clases',
    icono: CalendarDays,
    pantallas: [
      {
        nombre: 'Agenda',
        href: '/dashboard/agenda',
        icono: CalendarRange,
        modoMinimo: 'intermedio',
        // Muestra clases y jornadas: con poder ver una de las dos alcanza.
        visible: (ctx) => (ctx.modulos.clasesGrupales && puede(ctx, 'clases:leer')) || (ctx.modulos.controlPersonal && puede(ctx, 'turnos:leer')),
        alias: ['calendario'],
      },
      { nombre: 'Clases', href: '/dashboard/clases', icono: CalendarDays, permiso: 'clases:leer', modulo: 'clasesGrupales', alias: ['horarios', 'reservas'] },
      // En simple no aparece: se crean desde el asistente de clase (plan 11.11).
      { nombre: 'Disciplinas', href: '/dashboard/disciplinas', icono: ClipboardList, permiso: 'disciplinas:leer', modulo: 'clasesGrupales', modoMinimo: 'intermedio' },
    ],
  },
  {
    titulo: 'Lo que vendes',
    icono: Store,
    pantallas: [
      { nombre: 'Planes', href: '/dashboard/planes', icono: Briefcase, permiso: 'planes:leer', alias: ['precios'] },
      { nombre: 'Promociones', href: '/dashboard/promociones', icono: Tag, permiso: 'promociones:leer', modoMinimo: 'intermedio', alias: ['descuentos'] },
      { nombre: 'Productos', href: '/dashboard/productos', icono: Package, permiso: 'productos:leer', modulo: 'puntoVenta', alias: ['inventario', 'stock'] },
    ],
  },
  {
    titulo: 'Finanzas',
    icono: Banknote,
    pantallas: [
      { nombre: 'Movimientos', href: '/dashboard/transacciones', icono: Banknote, permiso: 'transacciones:leer', modulo: 'puntoVenta', alias: ['transacciones', 'ventas', 'cobros'] },
      { nombre: 'Gastos', href: '/dashboard/gastos', icono: Receipt, permiso: 'transacciones:leer', modulo: 'controlGastos', alias: ['egresos'] },
      { nombre: 'Proveedores', href: '/dashboard/proveedores', icono: Truck, permiso: 'transacciones:leer', modulo: 'controlGastos', modoMinimo: 'intermedio' },
      { nombre: 'Cuentas', href: '/dashboard/cuentas-bancarias', icono: Landmark, permiso: 'cuentas_bancarias:leer', modoMinimo: 'intermedio', alias: ['cuentas bancarias', 'bancos'] },
    ],
  },
  {
    titulo: 'Equipo',
    icono: Dumbbell,
    pantallas: [
      { nombre: 'Personal', href: '/dashboard/personal', icono: UserCog, permiso: 'staff:leer', modulo: 'controlPersonal', alias: ['equipo', 'empleados', 'instructores'] },
      { nombre: 'Jornadas', href: '/dashboard/turnos', icono: Clock, permiso: 'turnos:leer', modulo: 'controlPersonal', modoMinimo: 'intermedio', alias: ['turnos', 'horarios del equipo'] },
      // Tablet de recepción para marcar con PIN (fase 6, DB-4).
      { nombre: 'Tablet de marcaje', href: '/dashboard/marcaje', icono: Tablet, permiso: 'asistencias:crear', modulo: 'controlPersonal', modoMinimo: 'intermedio', alias: ['marcaje', 'pin'] },
    ],
  },
  {
    titulo: 'Reportes',
    icono: PieChart,
    pantallas: [
      { nombre: 'Resumen del negocio', href: '/dashboard/reportes', icono: FileText, permiso: 'transacciones:leer', alias: ['reportes', 'tablero'] },
      // Reportería (docs/plan-reporteria.md). En simple solo hay plantillas.
      {
        nombre: 'Reportería avanzada',
        nombrePorModo: { simple: 'Reportes listos' },
        href: '/dashboard/reporteria',
        icono: BarChart3,
        permiso: 'reportes:leer',
        alias: ['reportería', 'reportes guardados', 'exportar'],
      },
    ],
  },
  {
    titulo: 'Ajustes',
    icono: Settings,
    alFondo: true,
    pantallas: [
      { nombre: 'Sucursales', href: '/dashboard/sucursales', icono: Building2, permiso: 'sucursales:leer' },
      { nombre: 'Roles y permisos', href: '/dashboard/roles', icono: ShieldCheck, permiso: 'roles:leer', modoMinimo: 'intermedio', alias: ['roles'] },
      // D5: cuentas que no son empleados (contador, portal). Solo en experto,
      // o cuando no hay Equipo (módulo de personal apagado) para dar accesos.
      {
        nombre: 'Accesos avanzados',
        href: '/dashboard/usuarios',
        icono: KeyRound,
        permiso: 'usuarios:leer',
        visible: (ctx) => alMenos(ctx, 'experto') || !ctx.modulos.controlPersonal,
        alias: ['usuarios', 'cuentas de acceso'],
      },
      // Mismo permiso que exige el backend para guardarla (PUT /organizaciones/me/info).
      { nombre: 'Configuración', href: '/dashboard/configuracion', icono: Settings, permiso: 'organizaciones:actualizar', alias: ['módulos', 'modo de uso'] },
    ],
  },
];

/** Una pantalla que esta persona ve, con el nombre de su modo ya resuelto. */
type PantallaVisible = PantallaMenu;

export interface GrupoVisible extends Omit<GrupoMenu, 'pantallas'> {
  pantallas: PantallaVisible[];
}

/** Lo que ve esta persona: sin pantallas que no puede usar ni grupos vacíos. */
export function menuVisible(ctx: ContextoMenu, grupos: GrupoMenu[] = GRUPOS_MENU): GrupoVisible[] {
  return grupos
    .map((grupo) => ({
      ...grupo,
      pantallas: grupo.pantallas
        .filter(
          (p) =>
            (!p.permiso || puede(ctx, p.permiso)) &&
            (!p.modulo || ctx.modulos[p.modulo]) &&
            (!p.modoMinimo || alMenos(ctx, p.modoMinimo)) &&
            (!p.visible || p.visible(ctx)),
        )
        .map((p) => ({ ...p, nombre: p.nombrePorModo?.[ctx.modo] ?? p.nombre })),
    }))
    .filter((grupo) => grupo.pantallas.length > 0);
}

// Barra inferior del celular (fase 4): lo de recepción a un toque. Inicio y
// "Menú" van siempre; de estas, las que la persona puede usar.
const ACCESOS_CELULAR = ['/dashboard/asistencias', '/dashboard/clientes', '/dashboard/membresias'] as const;

/** Las pantallas de la barra inferior, en su orden, entre las que esta persona ve. */
export function accesosCelular(grupos: GrupoVisible[]): PantallaVisible[] {
  const visibles = grupos.flatMap((g) => g.pantallas);
  return ACCESOS_CELULAR.map((href) => visibles.find((p) => p.href === href)).filter((p): p is PantallaVisible => !!p);
}

/**
 * Si una pantalla del menú es la página actual (o una de sus subpáginas,
 * como /dashboard/reporteria/123). Inicio ('/dashboard') es prefijo de todo:
 * solo cuenta cuando es exactamente esa ruta.
 */
export function esPantallaActual(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === INICIO.href) return false;
  return pathname.startsWith(`${href}/`);
}
