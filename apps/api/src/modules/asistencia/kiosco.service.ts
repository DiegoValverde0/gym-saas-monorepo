import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { RedisClientType } from 'redis';
import { PrismaService } from '../../prisma/prisma.service';
import { combinarConfiguracion } from '../../common/utils/configuracion.util';
import { hashContrasena, verificarHash } from '../../common/utils/contrasena.util';
import { AsistenciaService, TokenPayload } from './asistencia.service';

// Intentos fallidos antes de bloquear 5 minutos: documentos que no existen
// (evita recorrer documentos para ver nombres) y PIN de salida incorrectos.
const MAX_DOCUMENTOS_DESCONOCIDOS = 10;
const MAX_PIN_INCORRECTOS = 5;
const BLOQUEO_SEGUNDOS = 5 * 60;

// Mensajes para el propio cliente, en segunda persona (los de
// validateAccess están escritos para recepción: "El cliente...").
const MENSAJE_RECHAZO: Record<string, string> = {
  SIN_MEMBRESIA: 'No tienes una membresía activa.',
  SESIONES_AGOTADAS: 'Ya usaste todas las sesiones de tu plan.',
  DIA_NO_PERMITIDO: 'Tu plan no incluye el día de hoy.',
  LIMITE_SEMANAL: 'Ya usaste los días de esta semana de tu plan.',
  FUERA_DE_HORARIO: 'Tu plan no permite ingresar a esta hora.',
  YA_INGRESO: 'Ya registraste tu ingreso hoy.',
};

interface ConfiguracionKiosco { kiosco?: { pinHash?: string } }

/**
 * Modo kiosco de Control de acceso (plan 10.3): una tablet en la entrada,
 * abierta con la sesión de quien atiende, donde el cliente escribe su
 * documento y ve "Bienvenido" o "Pasa por recepción". Salir del kiosco pide
 * el PIN que define el administrador (configuracion.kiosco.pinHash, que
 * nunca sale del servidor: ver configuracionPublica).
 */
@Injectable()
export class KioscoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly asistencia: AsistenciaService,
    @Inject('REDIS_CLIENT') private readonly redis: RedisClientType,
  ) {}

  private organizacionId(): string {
    const id = this.cls.get('organizacionId');
    if (!id) throw new ForbiddenException('Selecciona una organización.');
    return id;
  }

  private async organizacion() {
    const org = await this.prisma.extendedClient.organizacion.findUnique({ where: { id: this.organizacionId() }, select: { id: true, configuracion: true } });
    if (!org) throw new ForbiddenException('Organización no encontrada.');
    return org;
  }

  private async bloqueado(clave: string, maximo: number) {
    if (Number((await this.redis.get(clave)) ?? 0) >= maximo) {
      throw new HttpException('Demasiados intentos. Espera 5 minutos o pide ayuda en recepción.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async fallo(clave: string) {
    await this.redis.multi().incr(clave).expire(clave, BLOQUEO_SEGUNDOS).exec();
  }

  async ingresar(documento: string, sucursalId: string, user: TokenPayload) {
    const clave = `kiosco:desconocidos:${this.organizacionId()}:${user.sub}`;
    await this.bloqueado(clave, MAX_DOCUMENTOS_DESCONOCIDOS);

    // Documento exacto (sin búsquedas parciales): la pantalla la usa el público.
    const cliente = await this.prisma.extendedClient.cliente.findFirst({
      where: { numeroDocumento: documento.trim() },
      select: { id: true, nombre: true },
    });
    if (!cliente) {
      await this.fallo(clave);
      return { resultado: 'NO_ENCONTRADO' as const, mensaje: 'No encontramos ese documento.' };
    }
    await this.redis.del(clave);

    // Solo el primer nombre: la tablet está a la vista de todos.
    const nombre = cliente.nombre.trim().split(/\s+/)[0];
    const validacion = await this.asistencia.validateAccess(cliente.id, user, sucursalId, true);
    if (!validacion.allowed) {
      const codigo = validacion.codigo ?? '';
      return {
        resultado: codigo === 'YA_INGRESO' ? ('YA_INGRESO' as const) : ('RECHAZADO' as const),
        nombre,
        mensaje: MENSAJE_RECHAZO[codigo] ?? 'Tu plan no permite el ingreso ahora.',
      };
    }

    const registro = await this.asistencia.checkIn({ clienteId: cliente.id, sucursalId }, user, 'CODIGO_PIN');
    const membresia = validacion.membresiaId
      ? await this.prisma.extendedClient.membresia.findUnique({
          where: { id: validacion.membresiaId },
          select: { fechaFin: true, sesionesRestantes: true, plan: { select: { tipoPlan: true } } },
        })
      : null;
    return {
      resultado: 'BIENVENIDO' as const,
      nombre,
      sesionesRestantes: membresia?.plan.tipoPlan === 'SESIONES' ? membresia.sesionesRestantes : null,
      venceEl: membresia?.plan.tipoPlan === 'TIEMPO' && membresia.fechaFin ? membresia.fechaFin.toISOString().slice(0, 10) : null,
      clases: registro.clasesMarcadas,
    };
  }

  // Sin PIN definido se sale libremente (la pantalla lo avisa al abrir el kiosco).
  async salir(pin: string, user: TokenPayload) {
    const clave = `kiosco:pin:${this.organizacionId()}:${user.sub}`;
    await this.bloqueado(clave, MAX_PIN_INCORRECTOS);
    const pinHash = ((await this.organizacion()).configuracion as ConfiguracionKiosco | null)?.kiosco?.pinHash;
    if (pinHash && !(await verificarHash(pin, pinHash))) {
      await this.fallo(clave);
      throw new ForbiddenException('PIN incorrecto.');
    }
    await this.redis.del(clave);
    return { ok: true };
  }

  async definirPin(pin?: string) {
    const org = await this.organizacion();
    const configuracion = combinarConfiguracion(org.configuracion, { kiosco: { pinHash: pin ? await hashContrasena(pin) : '' } });
    await this.prisma.extendedClient.organizacion.update({ where: { id: org.id }, data: { configuracion } });
    return { tienePin: !!pin };
  }
}
