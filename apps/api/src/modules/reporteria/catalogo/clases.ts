import { Prisma } from '@prisma/client';
import { enHoraLocal, NOMBRES, TipoReporte } from './tipos';

const reservasCon = (estados: string) => `(SELECT count(*)::int FROM reservas_clases rc WHERE rc.clase_id = k.id AND rc.estado IN (${estados}))`;
const OCUPADOS = reservasCon("'CONFIRMADA', 'ASISTIO'");

// Sesiones de clase: una fila por sesión, con sus reservas y su ocupación.
export const SESIONES: TipoReporte = {
  clave: 'sesiones',
  nombre: 'Sesiones de clase',
  descripcion: 'Cada sesión de clase con su instructor, sala, reservas, asistentes y qué tan llena estuvo.',
  fila: 'Una fila por cada sesión',
  permiso: 'clases:leer',
  moduloGimnasio: 'clasesGrupales',
  tabla: { nombre: 'clases_programadas', alias: 'k', tieneDeletedAt: true },
  relaciones: [
    { alias: 'di', sql: 'LEFT JOIN disciplinas di ON di.id = k.disciplina_id' },
    { alias: 'sa', sql: 'LEFT JOIN salas sa ON sa.id = k.sala_id' },
    { alias: 's', sql: 'LEFT JOIN sucursales s ON s.id = k.sucursal_id' },
    { alias: 'ps', sql: 'LEFT JOIN perfiles_staff ps ON ps.id = k.entrenador_id' },
    { alias: 'ue', sql: 'LEFT JOIN usuarios ue ON ue.id = ps.usuario_id', requiere: ['ps'] },
  ],
  sucursal: { sql: 'k.sucursal_id', opcional: false },
  fechaPorDefecto: 'fecha',
  columnas: [
    { clave: 'fecha', nombre: 'Fecha y hora', grupo: 'Sesión', tipo: 'fechaHora', sql: 'k.fecha_hora' },
    { clave: 'dia', nombre: 'Día', grupo: 'Sesión', tipo: 'fecha', sql: (ctx) => Prisma.sql`${enHoraLocal('k.fecha_hora')(ctx)}::date` },
    {
      clave: 'horario',
      nombre: 'Horario',
      grupo: 'Sesión',
      tipo: 'texto',
      sql: (ctx) => Prisma.sql`to_char(${enHoraLocal('k.fecha_hora')(ctx)}, 'HH24:MI')`,
      ayuda: 'La hora de inicio (sirve para comparar horarios).',
    },
    {
      clave: 'diaSemana',
      nombre: 'Día de la semana',
      grupo: 'Sesión',
      tipo: 'lista',
      sql: (ctx) => Prisma.sql`EXTRACT(ISODOW FROM ${enHoraLocal('k.fecha_hora')(ctx)})::int::text`,
      opciones: NOMBRES.diaSemana,
    },
    { clave: 'clase', nombre: 'Clase', grupo: 'Sesión', tipo: 'texto', sql: 'k.nombre_clase' },
    { clave: 'estado', nombre: 'Estado', grupo: 'Sesión', tipo: 'lista', sql: 'k.estado::text', opciones: NOMBRES.estadoClase },
    { clave: 'duracion', nombre: 'Duración (min)', grupo: 'Sesión', tipo: 'numero', sql: 'k.duracion_minutos' },
    { clave: 'capacidad', nombre: 'Capacidad', grupo: 'Ocupación', tipo: 'numero', sql: 'k.capacidad_maxima' },
    { clave: 'ocupados', nombre: 'Lugares ocupados', grupo: 'Ocupación', tipo: 'numero', sql: OCUPADOS, ayuda: 'Reservas confirmadas más las de quienes asistieron.' },
    { clave: 'asistieron', nombre: 'Asistieron', grupo: 'Ocupación', tipo: 'numero', sql: reservasCon("'ASISTIO'") },
    { clave: 'enEspera', nombre: 'En lista de espera', grupo: 'Ocupación', tipo: 'numero', sql: reservasCon("'EN_ESPERA'") },
    { clave: 'ocupacion', nombre: 'Ocupación (%)', grupo: 'Ocupación', tipo: 'numero', sql: `ROUND(100.0 * ${OCUPADOS} / NULLIF(k.capacidad_maxima, 0))` },
    { clave: 'disciplina', nombre: 'Disciplina', grupo: 'Disciplina', tipo: 'texto', sql: "COALESCE(di.nombre, 'Sin disciplina')", usa: ['di'] },
    { clave: 'instructor', nombre: 'Instructor', grupo: 'Dónde y quién', tipo: 'texto', sql: "COALESCE(ue.nombre_completo, 'Sin instructor')", usa: ['ue'] },
    { clave: 'sala', nombre: 'Sala', grupo: 'Dónde y quién', tipo: 'texto', sql: 'sa.nombre', usa: ['sa'] },
    { clave: 'sucursal', nombre: 'Sucursal', grupo: 'Dónde y quién', tipo: 'texto', sql: 's.nombre', usa: ['s'] },
  ],
  columnasIniciales: ['fecha', 'clase', 'instructor', 'ocupados', 'capacidad', 'ocupacion'],
};

// Reservas: una fila por reserva de un cliente en una sesión.
export const RESERVAS: TipoReporte = {
  clave: 'reservas',
  nombre: 'Reservas de clases',
  descripcion: 'Quién reservó qué clase, con cuánta anticipación y si asistió, canceló o quedó en espera.',
  fila: 'Una fila por cada reserva',
  permiso: 'reservas:leer',
  moduloGimnasio: 'clasesGrupales',
  tabla: { nombre: 'reservas_clases', alias: 'r', tieneDeletedAt: false },
  obligatorias: ['k'],
  relaciones: [
    { alias: 'k', sql: 'JOIN clases_programadas k ON k.id = r.clase_id AND k.deleted_at IS NULL' },
    { alias: 'c', sql: 'LEFT JOIN clientes c ON c.id = r.cliente_id' },
    { alias: 'di', sql: 'LEFT JOIN disciplinas di ON di.id = k.disciplina_id', requiere: ['k'] },
    { alias: 's', sql: 'LEFT JOIN sucursales s ON s.id = k.sucursal_id', requiere: ['k'] },
  ],
  sucursal: { sql: 'k.sucursal_id', usa: ['k'], opcional: false },
  fechaPorDefecto: 'claseFecha',
  columnas: [
    { clave: 'claseFecha', nombre: 'Fecha de la clase', grupo: 'Clase', tipo: 'fechaHora', sql: 'k.fecha_hora', usa: ['k'] },
    { clave: 'clase', nombre: 'Clase', grupo: 'Clase', tipo: 'texto', sql: 'k.nombre_clase', usa: ['k'] },
    { clave: 'disciplina', nombre: 'Disciplina', grupo: 'Clase', tipo: 'texto', sql: "COALESCE(di.nombre, 'Sin disciplina')", usa: ['di'] },
    { clave: 'sucursal', nombre: 'Sucursal', grupo: 'Clase', tipo: 'texto', sql: 's.nombre', usa: ['s'] },
    { clave: 'estado', nombre: 'Estado de la reserva', grupo: 'Reserva', tipo: 'lista', sql: 'r.estado::text', opciones: NOMBRES.estadoReserva },
    { clave: 'reservadaEl', nombre: 'Reservada el', grupo: 'Reserva', tipo: 'fechaHora', sql: 'r.fecha_reserva' },
    {
      clave: 'anticipacion',
      nombre: 'Anticipación (horas)',
      grupo: 'Reserva',
      tipo: 'numero',
      sql: 'ROUND(EXTRACT(EPOCH FROM (k.fecha_hora - r.fecha_reserva)) / 3600)',
      usa: ['k'],
      ayuda: 'Cuántas horas antes de la clase se reservó.',
    },
    { clave: 'cliente', nombre: 'Cliente', grupo: 'Cliente', tipo: 'texto', sql: 'c.nombre', usa: ['c'] },
    { clave: 'clienteTelefono', nombre: 'Teléfono del cliente', grupo: 'Cliente', tipo: 'texto', sql: 'c.telefono', usa: ['c'] },
  ],
  columnasIniciales: ['claseFecha', 'clase', 'cliente', 'estado'],
};
