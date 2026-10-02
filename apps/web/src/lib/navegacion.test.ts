import { describe, expect, it } from 'vitest';
import type { ModulosConfig } from '@/hooks/use-modulos-activos';
import type { ModoUso } from '@/hooks/use-modo-uso';
import { accesosCelular, ContextoMenu, esPantallaActual, GRUPOS_MENU, menuVisible } from './navegacion';

// Permisos de los roles base (packages/database/prisma/base.ts), solo los que usa el menú.
const DUENO = [...new Set(GRUPOS_MENU.flatMap((g) => g.pantallas.map((p) => p.permiso)).filter(Boolean) as string[]), 'turnos:leer', 'clases:leer'];
const RECEPCION = [
  'cajas_registradoras:leer', 'clientes:leer', 'membresias:leer', 'asistencias:leer', 'asistencias:crear', 'transacciones:leer',
  'planes:leer', 'promociones:leer', 'productos:leer', 'clases:leer', 'cuentas_bancarias:leer', 'disciplinas:leer',
  'turnos:leer', 'sucursales:leer', 'reportes:leer',
];
const INSTRUCTOR = ['clientes:leer', 'asistencias:leer', 'clases:leer', 'disciplinas:leer', 'turnos:leer'];

const TODOS: ModulosConfig = { puntoVenta: true, clasesGrupales: true, controlPersonal: true, reportesAvanzados: true, controlGastos: true, controlAcceso: true };
// Los del backend por defecto (modulo.util.ts).
const POR_DEFECTO: ModulosConfig = { puntoVenta: true, clasesGrupales: false, controlPersonal: false, reportesAvanzados: true, controlGastos: false, controlAcceso: true };

const ctx = (permisos: string[], modo: ModoUso, modulos: Partial<ModulosConfig> = {}): ContextoMenu => ({ permisos, modo, modulos: { ...TODOS, ...modulos } });
const nombres = (c: ContextoMenu) => menuVisible(c).flatMap((g) => g.pantallas.map((p) => p.nombre));
const porGrupo = (c: ContextoMenu) => Object.fromEntries(menuVisible(c).map((g) => [g.titulo, g.pantallas.map((p) => p.nombre)]));

describe('menú lateral', () => {
  it('dueño en experto con todo encendido: los 7 grupos y las 23 pantallas, Ajustes al fondo', () => {
    const menu = menuVisible(ctx(DUENO, 'experto'));
    expect(menu.map((g) => g.titulo)).toEqual(['Día a día', 'Clases', 'Lo que vendes', 'Finanzas', 'Equipo', 'Reportes', 'Ajustes']);
    expect(menu.flatMap((g) => g.pantallas)).toHaveLength(23);
    expect(menu.filter((g) => g.alFondo).map((g) => g.titulo)).toEqual(['Ajustes']);
    expect(porGrupo(ctx(DUENO, 'experto'))['Día a día']).toEqual(['Asistencias', 'Clientes', 'Membresías', 'Caja']);
  });

  it('dueño en simple: 13 pantallas y la reportería se llama "Reportes listos"', () => {
    expect(porGrupo(ctx(DUENO, 'simple'))).toEqual({
      'Día a día': ['Asistencias', 'Clientes', 'Membresías'],
      Clases: ['Clases'],
      'Lo que vendes': ['Planes', 'Productos'],
      Finanzas: ['Movimientos', 'Gastos'],
      Equipo: ['Personal'],
      Reportes: ['Resumen del negocio', 'Reportes listos'],
      Ajustes: ['Sucursales', 'Configuración'],
    });
  });

  it('dueño en intermedio con los módulos por defecto: sin clases, equipo ni gastos', () => {
    expect(porGrupo({ permisos: DUENO, modo: 'intermedio', modulos: POR_DEFECTO })).toEqual({
      'Día a día': ['Asistencias', 'Clientes', 'Membresías', 'Caja'],
      'Lo que vendes': ['Planes', 'Promociones', 'Productos'],
      Finanzas: ['Movimientos', 'Cuentas'],
      Reportes: ['Resumen del negocio', 'Reportería avanzada'],
      // Sin módulo de personal, Accesos avanzados es la forma de dar cuentas.
      Ajustes: ['Sucursales', 'Roles y permisos', 'Accesos avanzados', 'Configuración'],
    });
  });

  it('recepción: 19 pantallas, sin Personal ni los ajustes del dueño', () => {
    const vistas = nombres(ctx(RECEPCION, 'experto'));
    expect(vistas).toHaveLength(19);
    for (const oculta of ['Personal', 'Roles y permisos', 'Accesos avanzados', 'Configuración']) expect(vistas).not.toContain(oculta);
    expect(vistas.slice(0, 4)).toEqual(['Asistencias', 'Clientes', 'Membresías', 'Caja']);
  });

  it('instructor: solo lo de clases, asistencias, clientes y su agenda', () => {
    expect(porGrupo(ctx(INSTRUCTOR, 'intermedio'))).toEqual({
      'Día a día': ['Asistencias', 'Clientes'],
      Clases: ['Agenda', 'Clases', 'Disciplinas'],
      Equipo: ['Jornadas'],
    });
  });

  it('cada módulo apagado esconde sus pantallas, y un grupo vacío no aparece', () => {
    expect(nombres(ctx(DUENO, 'experto', { clasesGrupales: false }))).not.toContain('Clases');
    // Agenda sigue: también muestra las jornadas.
    expect(nombres(ctx(DUENO, 'experto', { clasesGrupales: false }))).toContain('Agenda');
    expect(nombres(ctx(DUENO, 'experto', { clasesGrupales: false, controlPersonal: false }))).not.toContain('Agenda');
    expect(nombres(ctx(DUENO, 'experto', { controlAcceso: false }))).not.toContain('Asistencias');
    for (const p of ['Caja', 'Productos', 'Movimientos']) expect(nombres(ctx(DUENO, 'experto', { puntoVenta: false }))).not.toContain(p);
    expect(menuVisible(ctx(DUENO, 'experto', { controlPersonal: false })).map((g) => g.titulo)).not.toContain('Equipo');
  });

  it('barra del celular: Asistencias, Clientes y Membresías, solo si se pueden usar', () => {
    const barra = (c: ContextoMenu) => accesosCelular(menuVisible(c)).map((p) => p.nombre);
    expect(barra(ctx(RECEPCION, 'intermedio'))).toEqual(['Asistencias', 'Clientes', 'Membresías']);
    // El instructor no ve membresías; sin control de acceso no hay Asistencias.
    expect(barra(ctx(INSTRUCTOR, 'intermedio'))).toEqual(['Asistencias', 'Clientes']);
    expect(barra(ctx(DUENO, 'experto', { controlAcceso: false }))).toEqual(['Clientes', 'Membresías']);
  });

  it('cada ruta aparece una sola vez en todo el menú', () => {
    const rutas = GRUPOS_MENU.flatMap((g) => g.pantallas.map((p) => p.href));
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it('marca la pantalla actual también en sus subpáginas, pero Inicio solo en su ruta', () => {
    expect(esPantallaActual('/dashboard/reporteria/123/editar', '/dashboard/reporteria')).toBe(true);
    expect(esPantallaActual('/dashboard/reportes', '/dashboard/reporteria')).toBe(false);
    expect(esPantallaActual('/dashboard/clientes', '/dashboard')).toBe(false);
    expect(esPantallaActual('/dashboard', '/dashboard')).toBe(true);
  });
});
