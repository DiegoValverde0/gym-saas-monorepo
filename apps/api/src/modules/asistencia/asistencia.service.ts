import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAsistenciaDto } from './dto/create-asistencia.dto';
import { formatPermiso } from '../../common/utils/permiso.util';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

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

  async validateAccess(clienteId: string, user: TokenPayload) {
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
      return { allowed: false, reason: 'El cliente no tiene una membresía ACTIVA.' };
    }

    const { plan } = membresia;
    const now = new Date();

    // 1. Validar Día de la Semana (1 = Lunes, 7 = Domingo)
    const jsDay = now.getDay(); 
    const currentDay = jsDay === 0 ? 7 : jsDay;

    if (plan.diasPermitidos && plan.diasPermitidos.length > 0) {
      if (!plan.diasPermitidos.includes(currentDay)) {
        return { allowed: false, reason: 'El plan de este cliente no permite el ingreso el día de hoy.' };
      }
    }

    // 2. Validar Franja Horaria (Si existe)
    if (plan.horaInicioAcceso && plan.horaFinAcceso) {
        // En Prisma, @db.Time(6) se trae como Date con la fecha 1970-01-01
        // Solo nos interesa la hora y los minutos
        const inicioDate = new Date(plan.horaInicioAcceso);
        const finDate = new Date(plan.horaFinAcceso);

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = inicioDate.getUTCHours() * 60 + inicioDate.getUTCMinutes();
        const endMinutes = finDate.getUTCHours() * 60 + finDate.getUTCMinutes();

        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
            return { 
                allowed: false, 
                reason: `El ingreso está fuera del horario permitido (${inicioDate.getUTCHours().toString().padStart(2,'0')}:${inicioDate.getUTCMinutes().toString().padStart(2,'0')} a ${finDate.getUTCHours().toString().padStart(2,'0')}:${finDate.getUTCMinutes().toString().padStart(2,'0')}).` 
            };
        }
    }

    // 3. Validar Sesiones
    if (plan.tipoPlan === 'SESIONES') {
        if (!membresia.sesionesRestantes || membresia.sesionesRestantes <= 0) {
            return { allowed: false, reason: 'El cliente ha agotado sus sesiones disponibles.' };
        }
    }

    // 4. Validar 1 ingreso por día -- por defecto aplica a todos; solo se
    // exime quien tenga el permiso explícito asistencias:multiple_por_dia.
    const puedeMultiplesIngresos = user && (await this.tienePermiso(user, 'asistencias', 'multiple_por_dia'));
    if (user && !puedeMultiplesIngresos) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const ingresoHoy = await this.prisma.extendedClient.registroAsistencia.findFirst({
            where: {
                clienteId,
                fechaHoraIngreso: {
                    gte: startOfDay
                }
            }
        });

        if (ingresoHoy) {
            return { allowed: false, reason: 'El cliente ya registró un ingreso el día de hoy.' };
        }
    }

    return { 
        allowed: true, 
        membresiaId: membresia.id,
        tipoPlan: plan.tipoPlan,
        sesionesRestantes: membresia.sesionesRestantes 
    };
  }

  async checkIn(dto: CreateAsistenciaDto, user: TokenPayload) {
    let membresiaId = null;
    let descontarSesion = false;
    const userId = user.sub;

    if (dto.clienteId && (!dto.tipoAsistencia || dto.tipoAsistencia === 'MIEMBRO')) {
        const validation = await this.validateAccess(dto.clienteId, user);

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

    // Transacción para registrar el acceso y descontar sesiones si aplica
    return this.prisma.extendedClient.$transaction(async (tx) => {
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

        return registro;
    });
  }

  async checkOut(id: string) {
    const registro = await this.prisma.extendedClient.registroAsistencia.findUnique({
        where: { id }
    });
    if (!registro) throw new NotFoundException('Registro no encontrado');

    return this.prisma.extendedClient.registroAsistencia.update({
        where: { id },
        data: { fechaHoraSalida: new Date() }
    });
  }

  async findActivas(sucursalId: string) {
    // Personas que tienen fechaHoraIngreso de hoy, pero no tienen fechaHoraSalida
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

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

  async findHistorialHoy(sucursalId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

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
