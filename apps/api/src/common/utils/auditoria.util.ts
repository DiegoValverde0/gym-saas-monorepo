import { Logger } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { OperacionAuditoria, Prisma } from '@prisma/client';

const logger = new Logger('Auditoria');

export interface EventoAuditoria {
  tabla: string;
  operacion: OperacionAuditoria;
  /** Clave estable para filtrar (ej. 'eliminar', 'cambiar_precio'). */
  accion: string;
  /** Lo que se muestra en la pantalla de Actividad, en lenguaje del negocio. */
  descripcion: string;
  antes?: Record<string, unknown>;
  despues?: Record<string, unknown>;
}

// Cliente con la extensión de RLS (inyecta organizacionId al crear).
type DbAuditoria = { auditoria: { create: (args: { data: Prisma.AuditoriaUncheckedCreateInput }) => Promise<unknown> } };

/**
 * Anota una acción en la auditoría de la organización (plan 11.8, experto).
 * Quién y desde qué IP salen del contexto de la petición (JwtAuthGuard). No
 * anota nada del superadmin de plataforma ni fuera de una organización, y un
 * fallo al anotar nunca rompe la acción que se estaba haciendo.
 */
export async function registrarAuditoria(db: unknown, evento: EventoAuditoria): Promise<void> {
  const cls = ClsServiceManager.getClsService();
  if (!cls.isActive() || cls.get('is_superadmin') || !cls.get('organizacionId')) return;
  try {
    await (db as DbAuditoria).auditoria.create({
      data: {
        usuarioId: cls.get('usuarioId') ?? null,
        tablaAfectada: evento.tabla,
        operacion: evento.operacion,
        valoresAnteriores: (evento.antes ?? undefined) as Prisma.InputJsonValue | undefined,
        valoresNuevos: { accion: evento.accion, descripcion: evento.descripcion, ...(evento.despues ?? {}) } as Prisma.InputJsonValue,
        ipOrigen: (cls.get('ip') as string | undefined)?.slice(0, 45) ?? null,
      } as Prisma.AuditoriaUncheckedCreateInput,
    });
  } catch (err) {
    logger.error(`No se pudo anotar "${evento.accion}" en la auditoría: ${(err as Error).message}`);
  }
}

// Nombre con artículo de cada modelo que se manda a la papelera, para la
// descripción automática ("Eliminó el cliente ...").
const NOMBRE_MODELO: Record<string, string> = {
  Cliente: 'el cliente',
  Plan: 'el plan',
  Promocion: 'la promoción',
  Membresia: 'la membresía',
  Producto: 'el producto',
  Inventario: 'el stock',
  Sucursal: 'la sucursal',
  Rol: 'el rol',
  CajaRegistradora: 'la caja',
  CuentaBancaria: 'la cuenta',
  Proveedor: 'el proveedor',
  GastoPlantilla: 'el gasto recurrente',
  Transaccion: 'el movimiento',
  Disciplina: 'la disciplina',
  ClasePlantilla: 'la clase',
  ClaseProgramada: 'la sesión',
  ReservaClase: 'la reserva',
  PerfilStaff: 'a la persona del equipo',
  TurnoTrabajo: 'la jornada',
  TurnoPlantilla: 'el horario de trabajo',
  Usuario: 'la cuenta',
  Sala: 'la sala',
};

// Cómo se identifica el registro en la descripción.
export function etiquetaRegistro(registro: unknown): string {
  const r = (registro ?? {}) as Record<string, unknown>;
  const texto = r.nombre ?? r.nombreClase ?? r.nombreCompleto ?? r.beneficiario ?? r.banco;
  if (typeof texto === 'string' && texto.trim()) return `"${texto.trim()}"`;
  if (r.montoTotal !== undefined) return `de Bs. ${Number(r.montoTotal).toFixed(2)}`;
  if (r.montoFinal !== undefined) return `de Bs. ${Number(r.montoFinal).toFixed(2)}`;
  return '';
}

// Nombres para las descripciones (los mismos que muestra la pantalla, lib/roles.ts).
const ROL_LEGIBLE: Record<string, string> = { ADMIN_GYM: 'Administrador', RECEPCIONISTA: 'Recepción', ENTRENADOR: 'Instructor', CLIENTE: 'Cliente' };
export const nombreRolLegible = (nombre?: string | null) => (nombre ? ROL_LEGIBLE[nombre] ?? nombre : '');

const SECCION_LEGIBLE: Record<string, string> = {
  modoUso: 'modo de uso',
  modulos: 'módulos',
  requerimientosCliente: 'datos obligatorios de clientes',
  requerimientosClase: 'reglas de clases',
  clases: 'reglas de clases',
  jornadas: 'tolerancia de atrasos',
  onboarding: 'asistente de inicio',
  nombre: 'nombre',
  razonSocial: 'razón social',
  identificacionFiscal: 'NIT',
  telefono: 'teléfono',
  emailContacto: 'correo de contacto',
  moneda: 'moneda',
  zonaHoraria: 'zona horaria',
};
export const seccionLegible = (clave: string) => SECCION_LEGIBLE[clave] ?? clave;

export function descripcionEliminar(modelo: string, registro: unknown, verbo = 'Eliminó'): string {
  return `${verbo} ${NOMBRE_MODELO[modelo] ?? modelo} ${etiquetaRegistro(registro)}`.trim();
}
