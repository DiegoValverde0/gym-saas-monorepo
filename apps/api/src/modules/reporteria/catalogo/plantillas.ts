// Plantillas del sistema (docs/plan-reporteria.md, fase 7): reportes listos
// que ve todo el equipo con acceso a su tipo, también en modo simple. No se
// cambian ni se borran: se duplican. Viven aquí y se copian a la tabla
// reportes de cada gimnasio (es_plantilla) la primera vez que se usan; si
// aquí cambian, se actualizan solas.

export interface Plantilla {
  /** Fija: de ella sale el id de la plantilla en cada gimnasio. */
  clave: string;
  nombre: string;
  descripcion: string;
  /** Se valida contra el catálogo como cualquier reporte. */
  definicion: Record<string, unknown> & { tipo: string };
}

const fecha = (columna: string, rango: string) => ({ fecha: { columna, rango } });

export const PLANTILLAS: Plantilla[] = [
  {
    clave: 'ventas-mes-plan',
    nombre: 'Ventas de este mes por plan',
    descripcion: 'Cuántas membresías se vendieron este mes y cuánto sumó cada plan.',
    definicion: {
      tipo: 'ventas',
      formato: 'AGRUPADO',
      columnas: ['fecha', 'cliente', 'monto'],
      agrupaciones: [{ columna: 'plan' }],
      totales: [{ columna: 'monto', funcion: 'suma' }],
      mostrarDetalle: false,
      filtros: { ...fecha('fecha', 'este_mes'), campos: [{ columna: 'concepto', operador: 'en', valores: ['MEMBRESIA'] }] },
      orden: [],
      grafico: { tipo: 'barras', valor: 'suma:monto' },
    },
  },
  {
    clave: 'ingresos-mes-sucursal',
    nombre: 'Ingresos por mes y sucursal',
    descripcion: 'Lo vendido en cada sucursal, mes a mes, durante este año.',
    definicion: {
      tipo: 'ventas',
      formato: 'TABLA_CRUZADA',
      columnas: [],
      agrupaciones: [{ columna: 'sucursal' }],
      columnaCruzada: { columna: 'fecha', granularidad: 'mes' },
      totales: [{ columna: 'monto', funcion: 'suma' }],
      filtros: fecha('fecha', 'este_anio'),
      orden: [],
      grafico: { tipo: 'lineas', valor: 'suma:monto' },
    },
  },
  {
    clave: 'clientes-sin-venir-30',
    nombre: 'Clientes que no vienen hace 30 días',
    descripcion: 'Con membresía activa y sin ninguna asistencia en los últimos 30 días: para llamarlos.',
    definicion: {
      tipo: 'clientes',
      formato: 'LISTA',
      columnas: ['cliente', 'telefono', 'planActivo', 'vence', 'ultimaVisita', 'diasSinVenir'],
      agrupaciones: [],
      totales: [],
      filtros: {
        ...fecha('alta', 'todo'),
        campos: [],
        cruzados: [
          { clave: 'membresiaActiva', modo: 'con' },
          { clave: 'asistencias', modo: 'sin', rango: 'ultimos_30' },
        ],
      },
      orden: [{ columna: 'diasSinVenir', direccion: 'desc' }],
    },
  },
  {
    clave: 'membresias-por-vencer-7',
    nombre: 'Membresías por vencer en 7 días',
    descripcion: 'Membresías activas que vencen en la próxima semana: para ofrecer la renovación.',
    definicion: {
      tipo: 'membresias',
      formato: 'LISTA',
      columnas: ['cliente', 'clienteTelefono', 'plan', 'fechaFin', 'monto'],
      agrupaciones: [],
      totales: [],
      filtros: { ...fecha('fechaFin', 'proximos_7'), campos: [{ columna: 'estado', operador: 'en', valores: ['ACTIVA'] }] },
      orden: [{ columna: 'fechaFin', direccion: 'asc' }],
    },
  },
  {
    clave: 'ocupacion-clases-semana',
    nombre: 'Ocupación de clases de la semana',
    descripcion: 'Cada clase de esta semana con sus lugares ocupados, y el promedio de ocupación por clase.',
    definicion: {
      tipo: 'sesiones',
      formato: 'AGRUPADO',
      columnas: ['fecha', 'instructor', 'ocupados', 'capacidad', 'ocupacion'],
      agrupaciones: [{ columna: 'clase' }],
      totales: [
        { columna: 'ocupacion', funcion: 'promedio' },
        { columna: 'ocupados', funcion: 'suma' },
      ],
      mostrarDetalle: true,
      filtros: fecha('fecha', 'esta_semana'),
      orden: [{ columna: 'fecha', direccion: 'asc' }],
      grafico: { tipo: 'barras', valor: 'promedio:ocupacion' },
    },
  },
  {
    clave: 'diferencias-caja-mes',
    nombre: 'Diferencias de caja del mes',
    descripcion: 'Cierres de caja de este mes en los que lo contado no coincidió con lo esperado.',
    definicion: {
      tipo: 'cierresCaja',
      formato: 'LISTA',
      columnas: ['apertura', 'caja', 'abiertaPor', 'esperado', 'real', 'diferencia'],
      agrupaciones: [],
      totales: [{ columna: 'diferencia', funcion: 'suma' }],
      filtros: { ...fecha('apertura', 'este_mes'), campos: [{ columna: 'diferencia', operador: 'distinto', valor: 0 }] },
      orden: [{ columna: 'apertura', direccion: 'desc' }],
    },
  },
  {
    clave: 'productos-reponer',
    nombre: 'Productos bajo el punto de reorden',
    descripcion: 'Productos con stock en o por debajo de su punto de reorden, en cada sucursal.',
    definicion: {
      tipo: 'inventario',
      formato: 'LISTA',
      columnas: ['producto', 'sku', 'sucursal', 'cantidad', 'puntoReorden'],
      agrupaciones: [],
      totales: [],
      filtros: { ...fecha('actualizado', 'todo'), campos: [{ columna: 'reponer', operador: 'es_verdadero' }] },
      orden: [{ columna: 'cantidad', direccion: 'asc' }],
    },
  },
  {
    clave: 'atrasos-equipo-mes',
    nombre: 'Atrasos del equipo del mes',
    descripcion: 'Las llegadas tarde de este mes por persona: cuántas y cuántos minutos en total.',
    definicion: {
      tipo: 'jornadas',
      formato: 'AGRUPADO',
      columnas: ['fecha', 'entrada', 'ingresoReal', 'atraso'],
      agrupaciones: [{ columna: 'persona' }],
      totales: [{ columna: 'atraso', funcion: 'suma' }],
      mostrarDetalle: true,
      filtros: { ...fecha('fecha', 'este_mes'), campos: [{ columna: 'atraso', operador: 'mayor', valor: 0 }] },
      orden: [{ columna: 'fecha', direccion: 'asc' }],
      grafico: { tipo: 'barras', valor: 'suma:atraso' },
    },
  },
];
