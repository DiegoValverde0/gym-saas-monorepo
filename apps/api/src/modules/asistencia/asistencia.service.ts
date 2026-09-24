import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAsistenciaDto } from './dto/create-asistencia.dto';
import { formatPermiso } from '../../common/utils/permiso.util';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { aHoraLocal, desdeHoraLocal, inicioDelDiaLocal } from '../../common/utils/zona-horaria.util';

// Ventana en la que un ingreso al gimnasio cuenta como asistencia a una clase
// reservada: desde X minutos antes del inicio hasta que la clase termina.
const MINUTOS_ANTES_CLASE = 60;

export interface TokenPayload {
  sub: string;
  organizacionId?: string;
  is_superadmin?: boolean;
}

@Injectable()
export class AsistenciaService {
  private readonly logger = new Logger(AsistenciaService.name);

  constructor(private prisma: PrismaService) {}

  // Chequeo de permiso puntual (no vía @RequirePermissions, porque depende de
  // contenido de la request, no solo de la ruta) -- reemplaza lo que antes
  // era `user.rolNombre === 'RECEPCIONISTA'` hardcodeado.
  private async tienePermiso(user: TokenPayload, modulo: string, accion: string): Promise<boolean> {
    if (user.is_superadmin) return false; // el superadmin no escribe asistencias (ver PrismaService)
    const asignacion = await this.prisma.extendedClient.asignacionAcceso.findFirst({
      where: { usuarioId: user.sub, organizacionId: user.organizacionId },
      include: { rol: { include: { rolPermisos: { include: { permiso: true } } } } },
    });
    const permisos = asignacion?.rol.rolPermisos.map((rp) => formatPermiso(rp.permiso.modulo, rp.permiso.accion)) ?? [];
    return permisos.includes(formatPermiso(modulo, accion));
  }

  // Todas las comparaciones de "hoy", "esta semana" y franja horaria del plan
  // se hacen en la hora local de la organización, no en la del servidor (que
  // en Docker corre en UTC y desplazaba el día 4 horas en La Paz).
  private async zonaHoraria(organizacionId?: string): Promise<string | null> {
    if (!organizacionId) return null;
    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: organizacionId },
      select: { zonaHoraria: true },
    });
    return org?.zonaHoraria ?? null;
  }

  // Reservas confirmadas del cliente para clases de hoy que todavía no
  // terminaron (en la sucursal indicada, si se pasa).
  private async reservasDeHoy(clienteId: string, zonaHoraria: string | null, sucursalId?: string) {
    const ahora = new Date();
    const inicioHoy = inicioDelDiaLocal(ahora, zonaHoraria);
    const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60_000);
    const reservas = await this.prisma.extendedClient.reservaClase.findMany({
      where: {
        clienteId,
        estado: 'CONFIRMADA',
        clase: { fechaHora: { gte: inicioHoy, lt: finHoy }, ...(sucursalId ? { sucursalId } : {}) },
      },
      include: { clase: { select: { id: true, nombreClase: true, fechaHora: true, duracionMinutos: true } } },
      orderBy: { clase: { fechaHora: 'asc' } },
    });
    return (reservas as Array<{ id: string; clase: { nombreClase: string; fechaHora: Date; duracionMinutos: number } }>).filter(
      (r) => r.clase.fechaHora.getTime() + r.clase.duracionMinutos * 60_000 > ahora.getTime(),
    );
  }

  async validateAccess(clienteId: string, user: TokenPayload, sucursalId?: string) {
    const zonaHoraria = await this.zonaHoraria(user?.organizacionId);
    const now = new Date();
    const local = aHoraLocal(now, zonaHoraria);
    const inicioHoy = inicioDelDiaLocal(now, zonaHoraria);
    const clasesReservadasHoy = (await this.reservasDeHoy(clienteId, zonaHoraria, sucursalId)).map((r) => ({
      reservaId: r.id,
      nombreClase: r.clase.nombreClase,
      fechaHora: r.clase.fechaHora,
    }));

    const membresia = await this.prisma.extendedClient.membresia.findFirst({
      where: {
        clienteId,
        estado: 'ACTIVA',
      },
      include: {
        plan: true
      }
    });

    if (!membresia) {
      return { allowed: false, reason: 'El cliente no tiene una membresía ACTIVA.', clasesReservadasHoy };
    }

    const { plan } = membresia;

    // 1. Validar Día de la Semana (1 = Lunes, 7 = Domingo)
    const jsDay = local.fechaSolo.getUTCDay();
    const currentDay = jsDay === 0 ? 7 : jsDay;

    if (plan.diasPermitidos && plan.diasPermitidos.length > 0) {
      if (!plan.diasPermitidos.includes(currentDay)) {
        return { allowed: false, reason: 'El plan de este cliente no permite el ingreso el día de hoy.', clasesReservadasHoy };
      }
    }

    // 1.5. Validar límite de días por semana (plan.limiteDiasSemana, distinto
    // de diasPermitidos: ese fija QUÉ días son válidos, este fija CUÁNTOS
    // días distintos por semana puede venir, sin importar cuáles). Cuenta
    // días con ingreso ya registrados esta semana (excluyendo hoy, que es
    // justo lo que se está validando); si ya se alcanzó el límite, hoy sería
    // un día de más.
    if (plan.limiteDiasSemana && plan.limiteDiasSemana > 0) {
      const offsetLunes = jsDay === 0 ? 6 : jsDay - 1;
      const lunesLocal = new Date(local.fechaSolo.getTime() - offsetLunes * 24 * 60 * 60_000);
      const inicioSemana = desdeHoraLocal(lunesLocal, 0, zonaHoraria);

      const ingresosEstaSemana = await this.prisma.extendedClient.registroAsistencia.findMany({
        where: {
          clienteId,
          fechaHoraIngreso: { gte: inicioSemana, lt: inicioHoy },
        },
        select: { fechaHoraIngreso: true },
      });
      const diasDistintos = new Set(
        ingresosEstaSemana.map((r) => aHoraLocal(r.fechaHoraIngreso, zonaHoraria).fechaSolo.toISOString().slice(0, 10)),
      );

      if (diasDistintos.size >= plan.limiteDiasSemana) {
        return {
          allowed: false,
          reason: `El plan permite un máximo de ${plan.limiteDiasSemana} día(s) por semana, y ya se alcanzó ese límite esta semana.`,
          clasesReservadasHoy,
        };
      }
    }

    // 2. Validar Franja Horaria (Si existe)
    if (plan.horaInicioAcceso && plan.horaFinAcceso) {
        // En Prisma, @db.Time(6) se trae como Date con la fecha 1970-01-01
        // Solo nos interesa la hora y los minutos
        const inicioDate = new Date(plan.horaInicioAcceso);
        const finDate = new Date(plan.horaFinAcceso);

        const currentMinutes = local.minutosDelDia;
        const startMinutes = inicioDate.getUTCHours() * 60 + inicioDate.getUTCMinutes();
        const endMinutes = finDate.getUTCHours() * 60 + finDate.getUTCMinutes();

        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
            return { 
                allowed: false, 
                reason: `El ingreso está fuera del horario permitido (${inicioDate.getUTCHours().toString().padStart(2,'0')}:${inicioDate.getUTCMinutes().toString().padStart(2,'0')} a ${finDate.getUTCHours().toString().padStart(2,'0')}:${finDate.getUTCMinutes().toString().padStart(2,'0')}).`,
                clasesReservadasHoy,
            };
        }
    }

    // 3. Validar Sesiones
    if (plan.tipoPlan === 'SESIONES') {
        if (!membresia.sesionesRestantes || membresia.sesionesRestantes <= 0) {
            return { allowed: false, reason: 'El cliente ha agotado sus sesiones disponibles.', clasesReservadasHoy };
        }
    }

    // 4. Validar 1 ingreso por día -- por defecto aplica a todos; solo se
    // exime quien tenga el permiso explícito asistencias:multiple_por_dia.
    const puedeMultiplesIngresos = user && (await this.tienePermiso(user, 'asistencias', 'multiple_por_dia'));
    if (user && !puedeMultiplesIngresos) {
        const ingresoHoy = await this.prisma.extendedClient.registroAsistencia.findFirst({
            where: {
                clienteId,
                fechaHoraIngreso: {
                    gte: inicioHoy
                }
            }
        });

        if (ingresoHoy) {
            return { allowed: false, reason: 'El cliente ya registró un ingreso el día de hoy.', clasesReservadasHoy };
        }
    }

    return { 
        allowed: true, 
        membresiaId: membresia.id,
        tipoPlan: plan.tipoPlan,
        sesionesRestantes: membresia.sesionesRestantes,
        clasesReservadasHoy,
    };
  }

  async checkIn(dto: CreateAsistenciaDto, user: TokenPayload) {
    let membresiaId = null;
    let descontarSesion = false;
    const userId = user.sub;
    const esMiembro = !dto.tipoAsistencia || dto.tipoAsistencia === 'MIEMBRO';

    if (esMiembro && !dto.clienteId) {
        throw new BadRequestException('Para registrar el ingreso de un miembro hay que seleccionar al cliente.');
    }
    if (!dto.clienteId && !dto.nombreVisitante?.trim()) {
        throw new BadRequestException('Indica el nombre del visitante.');
    }

    if (dto.clienteId && esMiembro) {
        const validation = await this.validateAccess(dto.clienteId, user, dto.sucursalId);

        if (!validation.allowed) {
            if (!dto.forzarIngreso) {
                throw new BadRequestException(validation.reason);
            }
            if (!(await this.tienePermiso(user, 'asistencias', 'forzar'))) {
                throw new ForbiddenException('No tienes permiso para forzar un ingreso que no pasó las validaciones.');
            }
        }

        membresiaId = validation.membresiaId || null;
        if (validation.tipoPlan === 'SESIONES') {
            descontarSesion = true;
        }
    }

    // Reservas de clase que este ingreso cubre: clases de hoy en esta sucursal
    // que empiezan dentro de la próxima hora o ya están en curso.
    const reservasACubrir = dto.clienteId
        ? (await this.reservasDeHoy(dto.clienteId, await this.zonaHoraria(user.organizacionId), dto.sucursalId)).filter(
              (r) => r.clase.fechaHora.getTime() - MINUTOS_ANTES_CLASE * 60_000 <= Date.now(),
          )
        : [];

    // Transacción para registrar el acceso y descontar sesiones si aplica
    const registro = await this.prisma.extendedClient.$transaction(async (tx) => {
        const registro = await tx.registroAsistencia.create({
            // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
            data: {
                clienteId: dto.clienteId || null,
                sucursalId: dto.sucursalId,
                membresiaId: membresiaId,
                tipoAsistencia: dto.tipoAsistencia || 'MIEMBRO',
                nombreVisitante: dto.nombreVisitante || null,
                metodoValidacion: 'MANUAL',
                registradoPorId: userId,
                motivoAnulacion: dto.forzarIngreso ? (dto.motivoForzado || 'Ingreso Forzado Manualmente') : null
            } as unknown as Prisma.RegistroAsistenciaUncheckedCreateInput,
            include: {
                cliente: { select: { nombre: true } }
            }
        });

        if (descontarSesion && membresiaId) {
            const memUpdated = await tx.membresia.update({
                where: { id: membresiaId },
                data: {
                    sesionesRestantes: { decrement: 1 }
                }
            });

            // Si llegó a cero sesiones, cambiar a AGOTADA automáticamente
            if (memUpdated.sesionesRestantes !== null && memUpdated.sesionesRestantes <= 0) {
                await tx.membresia.update({
                    where: { id: membresiaId },
                    data: { estado: 'AGOTADA' }
                });
            }
        }

        if (reservasACubrir.length > 0) {
            await tx.reservaClase.updateMany({
                where: { id: { in: reservasACubrir.map((r) => r.id) } },
                data: { estado: 'ASISTIO' },
            });
        }

        return registro;
    });

    return { ...registro, clasesMarcadas: reservasACubrir.map((r) => r.clase.nombreClase) };
  }

  async checkOut(id: string) {
    const registro = await this.prisma.extendedClient.registroAsistencia.findUnique({
        where: { id }
    });
    if (!registro) throw new NotFoundException('Registro no encontrado');
    if (registro.fechaHoraSalida) throw new BadRequestException('Este ingreso ya tiene registrada la salida.');

    return this.prisma.extendedClient.registroAsistencia.update({
        where: { id },
        data: { fechaHoraSalida: new Date() }
    });
  }

  async findActivas(sucursalId: string, organizacionId?: string) {
    // Personas que tienen fechaHoraIngreso de hoy, pero no tienen fechaHoraSalida
    const startOfDay = inicioDelDiaLocal(new Date(), await this.zonaHoraria(organizacionId));

    return this.prisma.extendedClient.registroAsistencia.findMany({
        where: {
            sucursalId,
            fechaHoraSalida: null,
            fechaHoraIngreso: {
                gte: startOfDay
            }
        },
        orderBy: { fechaHoraIngreso: 'desc' },
        include: {
            cliente: { select: { nombre: true, numeroDocumento: true } },
            membresia: {
                select: {
                    plan: { select: { nombre: true } }
                }
            }
        }
    });
  }

  async findHistorialHoy(sucursalId: string, organizacionId?: string) {
    const startOfDay = inicioDelDiaLocal(new Date(), await this.zonaHoraria(organizacionId));

    return this.prisma.extendedClient.registroAsistencia.findMany({
        where: {
            sucursalId,
            fechaHoraIngreso: {
                gte: startOfDay
            }
        },
        orderBy: { fechaHoraIngreso: 'desc' },
        include: {
            cliente: { select: { nombre: true, numeroDocumento: true } },
            membresia: {
                select: {
                    plan: { select: { nombre: true } }
                }
            },
            registradoPor: { select: { nombreCompleto: true } }
        }
    });
  }

  // =========================================================================
  // CRON: AUTO CHECKOUT
  // =========================================================================

  // Corre todos los días a las 2 AM, sin contexto CLS (los crons no pasan por
  // ClsMiddleware) y recorre TODAS las organizaciones por diseño, así que usa
  // el cliente crudo de Prisma a propósito -- ver excludedFiles en
  // .eslintrc.js. Nunca se fuerza un organizacionId falso sobre extendedClient.
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleAutoCheckout() {
    this.logger.log('Iniciando proceso de Auto-Checkout para registros huérfanos...');

    const hoy = new Date();
    hoy.setHours(0,0,0,0);

    // Buscar a todos los que entraron ANTES de hoy y no salieron
    const resultado = await this.prisma.registroAsistencia.updateMany({
        where: {
            fechaHoraSalida: null,
            fechaHoraIngreso: {
                lt: hoy
            }
        },
        data: {
            fechaHoraSalida: new Date(),
            motivoAnulacion: 'Cierre automático del sistema (CRON 2AM)'
        }
    });

    this.logger.log(`Proceso completado. Se cerraron ${resultado.count} accesos que no marcaron salida.`);
  }
}
