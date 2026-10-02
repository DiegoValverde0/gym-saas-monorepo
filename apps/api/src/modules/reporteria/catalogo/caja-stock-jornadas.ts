import { Prisma } from '@prisma/client';
import { NOMBRES, TipoReporte } from './tipos';

// Cierres de caja: una fila por cada turno de caja (apertura).
export const CIERRES_CAJA: TipoReporte = {
  clave: 'cierresCaja',
  nombre: 'Cierres de caja',
  descripcion: 'Cada turno de caja: quién la abrió, con cuánto, lo que debía haber al cerrar, lo que hubo y la diferencia.',
  fila: 'Una fila por cada turno de caja',
  permiso: 'aperturas_caja:leer',
  moduloGimnasio: 'puntoVenta',
  tabla: { nombre: 'aperturas_caja', alias: 'ap', tieneDeletedAt: false },
  obligatorias: ['cj'],
  relaciones: [
    { alias: 'cj', sql: 'JOIN cajas_registradoras cj ON cj.id = ap.caja_id' },
    { alias: 's', sql: 'LEFT JOIN sucursales s ON s.id = cj.sucursal_id', requiere: ['cj'] },
    { alias: 'u', sql: 'LEFT JOIN usuarios u ON u.id = ap.usuario_id' },
  ],
  sucursal: { sql: 'cj.sucursal_id', usa: ['cj'], opcional: false },
  creadoPor: { sql: 'ap.usuario_id' },
  fechaPorDefecto: 'apertura',
  columnas: [
    { clave: 'apertura', nombre: 'Abierta el', grupo: 'Turno de caja', tipo: 'fechaHora', sql: 'ap.fecha_apertura' },
    { clave: 'cierre', nombre: 'Cerrada el', grupo: 'Turno de caja', tipo: 'fechaHora', sql: 'ap.fecha_cierre' },
    { clave: 'estado', nombre: 'Estado', grupo: 'Turno de caja', tipo: 'lista', sql: 'ap.estado::text', opciones: NOMBRES.estadoApertura },
    { clave: 'horas', nombre: 'Duración (horas)', grupo: 'Turno de caja', tipo: 'numero', sql: 'ROUND(EXTRACT(EPOCH FROM (ap.fecha_cierre - ap.fecha_apertura)) / 3600, 1)' },
    { clave: 'inicial', nombre: 'Monto inicial', grupo: 'Montos', tipo: 'moneda', sql: 'ap.monto_inicial' },
    { clave: 'esperado', nombre: 'Esperado al cerrar', grupo: 'Montos', tipo: 'moneda', sql: 'ap.monto_cierre_esperado' },
    { clave: 'real', nombre: 'Contado al cerrar', grupo: 'Montos', tipo: 'moneda', sql: 'ap.monto_cierre_real' },
    {
      clave: 'diferencia',
      nombre: 'Diferencia',
      grupo: 'Montos',
      tipo: 'moneda',
      sql: 'ap.monto_cierre_real - ap.monto_cierre_esperado',
      ayuda: 'Contado menos esperado: negativo es faltante, positivo es sobrante.',
    },
    { clave: 'observaciones', nombre: 'Observaciones', grupo: 'Turno de caja', tipo: 'texto', sql: 'ap.observaciones' },
    { clave: 'caja', nombre: 'Caja', grupo: 'Dónde y quién', tipo: 'texto', sql: 'cj.nombre', usa: ['cj'] },
    { clave: 'sucursal', nombre: 'Sucursal', grupo: 'Dónde y quién', tipo: 'texto', sql: 's.nombre', usa: ['s'] },
    { clave: 'abiertaPor', nombre: 'Abierta por', grupo: 'Dónde y quién', tipo: 'texto', sql: 'u.nombre_completo', usa: ['u'] },
  ],
  columnasIniciales: ['apertura', 'caja', 'abiertaPor', 'esperado', 'real', 'diferencia'],
};

// Inventario: una fila por producto y sucursal (una foto del stock de hoy).
export const INVENTARIO: TipoReporte = {
  clave: 'inventario',
  nombre: 'Inventario',
  descripcion: 'El stock de cada producto en cada sucursal, cuánto vale y qué está por acabarse.',
  fila: 'Una fila por cada producto en cada sucursal',
  permiso: 'inventarios:leer',
  moduloGimnasio: 'puntoVenta',
  tabla: { nombre: 'inventarios', alias: 'i', tieneDeletedAt: false },
  obligatorias: ['pr'],
  relaciones: [
    { alias: 'pr', sql: 'JOIN productos pr ON pr.id = i.producto_id AND pr.deleted_at IS NULL' },
    { alias: 's', sql: 'LEFT JOIN sucursales s ON s.id = i.sucursal_id' },
  ],
  sucursal: { sql: 'i.sucursal_id', opcional: false },
  fechaPorDefecto: 'actualizado',
  rangoPorDefecto: 'todo',
  columnas: [
    { clave: 'producto', nombre: 'Producto', grupo: 'Producto', tipo: 'texto', sql: 'pr.nombre', usa: ['pr'] },
    { clave: 'sku', nombre: 'Código', grupo: 'Producto', tipo: 'texto', sql: 'pr.sku', usa: ['pr'] },
    { clave: 'precio', nombre: 'Precio de venta', grupo: 'Producto', tipo: 'moneda', sql: 'pr.precio_venta', usa: ['pr'] },
    { clave: 'cantidad', nombre: 'Cantidad', grupo: 'Stock', tipo: 'numero', sql: 'i.cantidad_actual' },
    { clave: 'puntoReorden', nombre: 'Punto de reorden', grupo: 'Stock', tipo: 'numero', sql: 'i.punto_reorden', ayuda: 'Con esta cantidad o menos, hay que reponer.' },
    { clave: 'reponer', nombre: 'Hay que reponer', grupo: 'Stock', tipo: 'booleano', sql: 'i.cantidad_actual <= i.punto_reorden' },
    { clave: 'valor', nombre: 'Valor del stock', grupo: 'Stock', tipo: 'moneda', sql: 'i.cantidad_actual * pr.precio_venta', usa: ['pr'], ayuda: 'Cantidad × precio de venta.' },
    { clave: 'ubicacion', nombre: 'Ubicación', grupo: 'Stock', tipo: 'texto', sql: 'i.ubicacion_bodega' },
    { clave: 'actualizado', nombre: 'Actualizado el', grupo: 'Stock', tipo: 'fechaHora', sql: 'i.updated_at' },
    { clave: 'sucursal', nombre: 'Sucursal', grupo: 'Dónde', tipo: 'texto', sql: 's.nombre', usa: ['s'] },
  ],
  columnasIniciales: ['producto', 'sucursal', 'cantidad', 'puntoReorden', 'reponer'],
};

// Jornadas del equipo: una fila por jornada programada. Sin costos (los ven
// también recepción e instructores, que tienen turnos:leer).
export const JORNADAS: TipoReporte = {
  clave: 'jornadas',
  nombre: 'Jornadas del equipo',
  descripcion: 'Las jornadas de cada persona del equipo: horario, a qué hora marcó, atrasos, ausencias y horas trabajadas.',
  fila: 'Una fila por cada jornada',
  permiso: 'turnos:leer',
  moduloGimnasio: 'controlPersonal',
  tabla: { nombre: 'turnos_trabajo', alias: 'tt', tieneDeletedAt: true },
  obligatorias: ['ps'],
  relaciones: [
    { alias: 'ps', sql: 'JOIN perfiles_staff ps ON ps.id = tt.staff_id' },
    { alias: 'u', sql: 'LEFT JOIN usuarios u ON u.id = ps.usuario_id', requiere: ['ps'] },
    { alias: 's', sql: 'LEFT JOIN sucursales s ON s.id = tt.sucursal_id' },
  ],
  sucursal: { sql: 'tt.sucursal_id', opcional: false },
  fechaPorDefecto: 'fecha',
  columnas: [
    { clave: 'fecha', nombre: 'Fecha', grupo: 'Jornada', tipo: 'fecha', sql: 'tt.fecha' },
    { clave: 'entrada', nombre: 'Entrada programada', grupo: 'Jornada', tipo: 'texto', sql: "to_char(tt.hora_entrada, 'HH24:MI')" },
    { clave: 'salida', nombre: 'Salida programada', grupo: 'Jornada', tipo: 'texto', sql: "to_char(tt.hora_salida, 'HH24:MI')" },
    { clave: 'estado', nombre: 'Estado', grupo: 'Jornada', tipo: 'lista', sql: 'tt.estado::text', opciones: NOMBRES.estadoTurno },
    { clave: 'ingresoReal', nombre: 'Marcó entrada', grupo: 'Marcaje', tipo: 'fechaHora', sql: 'tt.hora_ingreso_real' },
    { clave: 'salidaReal', nombre: 'Marcó salida', grupo: 'Marcaje', tipo: 'fechaHora', sql: 'tt.hora_salida_real' },
    {
      clave: 'atraso',
      nombre: 'Atraso (min)',
      grupo: 'Marcaje',
      tipo: 'numero',
      // La marca real en hora del gimnasio contra la fecha + hora programada.
      sql: (ctx) =>
        Prisma.sql`CASE WHEN tt.hora_ingreso_real IS NOT NULL THEN GREATEST(0,
          ROUND(EXTRACT(EPOCH FROM ((tt.hora_ingreso_real AT TIME ZONE ${ctx.zonaHoraria}) - (tt.fecha + tt.hora_entrada))) / 60)) END`,
      ayuda: 'Minutos después de la hora programada (0 si llegó a tiempo; vacío si no marcó).',
    },
    { clave: 'horas', nombre: 'Horas trabajadas', grupo: 'Marcaje', tipo: 'numero', sql: 'ROUND(EXTRACT(EPOCH FROM (tt.hora_salida_real - tt.hora_ingreso_real)) / 3600, 2)' },
    { clave: 'motivo', nombre: 'Motivo de ausencia', grupo: 'Jornada', tipo: 'texto', sql: 'tt.motivo_ausencia' },
    { clave: 'persona', nombre: 'Persona', grupo: 'Persona', tipo: 'texto', sql: 'u.nombre_completo', usa: ['u'] },
    { clave: 'contratacion', nombre: 'Contratación', grupo: 'Persona', tipo: 'lista', sql: 'ps.tipo_contratacion::text', usa: ['ps'], opciones: NOMBRES.contratacion },
    { clave: 'sucursal', nombre: 'Sucursal', grupo: 'Dónde', tipo: 'texto', sql: 's.nombre', usa: ['s'] },
  ],
  columnasIniciales: ['fecha', 'persona', 'entrada', 'ingresoReal', 'atraso', 'estado'],
};
