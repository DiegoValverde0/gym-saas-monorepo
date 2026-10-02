import { Prisma } from '@prisma/client';
import { entreFechas, NOMBRES, TipoReporte } from './tipos';

// Hoy en la hora del gimnasio, como fecha.
const hoy = (tz: string) => Prisma.sql`(now() AT TIME ZONE ${tz})::date`;
// Último ingreso del cliente (los anulados no cuentan).
const ULTIMA_VISITA = 'SELECT max(ra.fecha_hora_ingreso) FROM registros_asistencia ra WHERE ra.cliente_id = c.id AND ra.deleted_at IS NULL';
// Membresía activa (si tiene más de una, la que vence último).
const ACTIVA = "FROM membresias mv JOIN planes pv ON pv.id = mv.plan_id WHERE mv.cliente_id = c.id AND mv.deleted_at IS NULL AND mv.estado = 'ACTIVA'";

// Clientes: una fila por cliente. Sin datos sensibles (condiciones médicas,
// contacto de emergencia, dirección).
export const CLIENTES: TipoReporte = {
  clave: 'clientes',
  nombre: 'Clientes',
  descripcion: 'Tus clientes: datos de contacto, si tienen membresía activa, cuándo vinieron por última vez y cuánto compraron.',
  fila: 'Una fila por cada cliente',
  permiso: 'clientes:leer',
  tabla: { nombre: 'clientes', alias: 'c', tieneDeletedAt: true },
  relaciones: [{ alias: 's', sql: 'LEFT JOIN sucursales s ON s.id = c.sucursal_base_id' }],
  sucursal: { sql: 'c.sucursal_base_id', opcional: true },
  creadoPor: { sql: 'c.creado_por_id' },
  fechaPorDefecto: 'alta',
  rangoPorDefecto: 'todo',
  columnas: [
    { clave: 'cliente', nombre: 'Cliente', grupo: 'Cliente', tipo: 'texto', sql: 'c.nombre' },
    { clave: 'documento', nombre: 'Documento', grupo: 'Cliente', tipo: 'texto', sql: 'c.numero_documento' },
    { clave: 'telefono', nombre: 'Teléfono', grupo: 'Cliente', tipo: 'texto', sql: 'c.telefono' },
    { clave: 'correo', nombre: 'Correo', grupo: 'Cliente', tipo: 'texto', sql: 'c.correo' },
    { clave: 'genero', nombre: 'Género', grupo: 'Cliente', tipo: 'lista', sql: 'c.genero::text', opciones: NOMBRES.genero },
    { clave: 'edad', nombre: 'Edad', grupo: 'Cliente', tipo: 'numero', sql: "date_part('year', age(c.fecha_nacimiento))::int" },
    { clave: 'estado', nombre: 'Estado', grupo: 'Cliente', tipo: 'lista', sql: 'c.estado::text', opciones: NOMBRES.estadoCliente },
    { clave: 'alta', nombre: 'Cliente desde', grupo: 'Cliente', tipo: 'fechaHora', sql: 'c.created_at' },
    { clave: 'portal', nombre: 'Tiene acceso al portal', grupo: 'Cliente', tipo: 'booleano', sql: 'c.usuario_id IS NOT NULL' },
    { clave: 'sucursal', nombre: 'Sucursal base', grupo: 'Cliente', tipo: 'texto', sql: 's.nombre', usa: ['s'] },
    { clave: 'tieneActiva', nombre: 'Tiene membresía activa', grupo: 'Membresía', tipo: 'booleano', sql: `EXISTS (SELECT 1 ${ACTIVA})` },
    { clave: 'planActivo', nombre: 'Plan activo', grupo: 'Membresía', tipo: 'texto', sql: `(SELECT pv.nombre ${ACTIVA} ORDER BY mv.fecha_fin DESC NULLS FIRST LIMIT 1)` },
    { clave: 'vence', nombre: 'Su membresía vence', grupo: 'Membresía', tipo: 'fecha', sql: `(SELECT mv.fecha_fin ${ACTIVA} ORDER BY mv.fecha_fin DESC NULLS FIRST LIMIT 1)` },
    { clave: 'ultimaVisita', nombre: 'Última visita', grupo: 'Asistencia', tipo: 'fechaHora', sql: `(${ULTIMA_VISITA})` },
    {
      clave: 'diasSinVenir',
      nombre: 'Días sin venir',
      grupo: 'Asistencia',
      tipo: 'numero',
      sql: (ctx) => Prisma.sql`(${hoy(ctx.zonaHoraria)} - ((${Prisma.raw(ULTIMA_VISITA)}) AT TIME ZONE ${ctx.zonaHoraria})::date)`,
      ayuda: 'Desde su último ingreso hasta hoy (vacío si nunca vino).',
    },
    {
      clave: 'visitas30',
      nombre: 'Visitas en los últimos 30 días',
      grupo: 'Asistencia',
      tipo: 'numero',
      sql: (ctx) =>
        Prisma.sql`(SELECT count(*)::int FROM registros_asistencia ra WHERE ra.cliente_id = c.id AND ra.deleted_at IS NULL
          AND (ra.fecha_hora_ingreso AT TIME ZONE ${ctx.zonaHoraria})::date > ${hoy(ctx.zonaHoraria)} - 30)`,
    },
    {
      clave: 'totalComprado',
      nombre: 'Total comprado',
      grupo: 'Compras',
      tipo: 'moneda',
      sql: "(SELECT COALESCE(sum(t.monto_total), 0) FROM transacciones t WHERE t.cliente_id = c.id AND t.deleted_at IS NULL AND t.tipo = 'INGRESO')",
      ayuda: 'Suma de todas sus compras (membresías, productos y otros).',
    },
  ],
  columnasIniciales: ['cliente', 'telefono', 'planActivo', 'vence', 'ultimaVisita'],
  cruzados: [
    { clave: 'membresiaActiva', nombre: 'membresía activa', conRango: false, existe: () => Prisma.raw(`EXISTS (SELECT 1 ${ACTIVA})`) },
    {
      clave: 'asistencias',
      nombre: 'asistencias',
      conRango: true,
      existe: (ctx, desde, hasta) =>
        Prisma.sql`EXISTS (SELECT 1 FROM registros_asistencia ra WHERE ra.cliente_id = c.id AND ra.deleted_at IS NULL${entreFechas('ra.fecha_hora_ingreso', ctx, desde, hasta)})`,
    },
    {
      clave: 'reservas',
      nombre: 'reservas de clases',
      conRango: true,
      existe: (ctx, desde, hasta) =>
        Prisma.sql`EXISTS (SELECT 1 FROM reservas_clases rc JOIN clases_programadas kc ON kc.id = rc.clase_id AND kc.deleted_at IS NULL
          WHERE rc.cliente_id = c.id AND rc.estado IN ('CONFIRMADA', 'ASISTIO')${entreFechas('kc.fecha_hora', ctx, desde, hasta)})`,
    },
    {
      clave: 'compras',
      nombre: 'compras',
      conRango: true,
      existe: (ctx, desde, hasta) =>
        Prisma.sql`EXISTS (SELECT 1 FROM transacciones tc WHERE tc.cliente_id = c.id AND tc.deleted_at IS NULL AND tc.tipo = 'INGRESO'${entreFechas('tc.fecha_hora', ctx, desde, hasta)})`,
    },
  ],
};
