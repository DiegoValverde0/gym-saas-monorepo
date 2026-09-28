import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { RedisClientType } from 'redis';
import { PrismaService } from '../../prisma/prisma.service';
import { generarContrasenaTemporal, hashContrasena } from '../../common/utils/contrasena.util';
import { cerrarSesiones, cuentaSoloDeEstaOrganizacion, invalidarAccesoVigente, ultimasActividades } from '../../common/utils/acceso-vigente.util';
import { esRolCliente, ROL_CLIENTE } from '../../common/utils/rol.util';
import { registrarAuditoria } from '../../common/utils/auditoria.util';

/**
 * Acceso al portal del cliente desde su ficha (docs/plan-portal-cliente.md,
 * fase 2): crear o enlazar la cuenta (clientes.usuario_id, DB-6), darle una
 * contraseña nueva y quitar el acceso.
 */
@Injectable()
export class AccesoPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    @Inject('REDIS_CLIENT') private readonly redis: RedisClientType,
  ) {}

  private async cliente(id: string) {
    const cliente = await this.prisma.extendedClient.cliente.findUnique({
      where: { id },
      select: { id: true, nombre: true, correo: true, telefono: true, usuarioId: true, usuario: { select: { correo: true } } },
    });
    if (!cliente) throw new NotFoundException('El cliente no existe.');
    return cliente;
  }

  // Para la ficha: con qué correo entra y cuándo usó el portal por última vez.
  async estado(clienteId: string) {
    const cliente = await this.cliente(clienteId);
    if (!cliente.usuarioId || !cliente.usuario) return null;
    const actividad = await ultimasActividades(this.redis, [cliente.usuarioId], this.cls.get('organizacionId')).catch(() => null);
    return { correo: cliente.usuario.correo, ultimaActividad: actividad?.get(cliente.usuarioId) ?? null };
  }

  /**
   * Correo nuevo: crea la cuenta con una contraseña temporal. Correo de una
   * cuenta que ya existe: la enlaza; si esa cuenta solo es de este gimnasio
   * (por ejemplo, se le quitó el acceso antes) también le da una contraseña
   * temporal, y si entra a otro gimnasio conserva la suya.
   */
  async darAcceso(clienteId: string, correoPedido?: string) {
    const cliente = await this.cliente(clienteId);
    if (cliente.usuarioId) throw new ConflictException(`${cliente.nombre} ya tiene acceso al portal.`);
    const correo = (correoPedido ?? cliente.correo ?? '').trim().toLowerCase();
    if (!correo) throw new BadRequestException('Anota el correo con el que va a entrar.');
    const organizacionId = this.cls.get('organizacionId');
    const contrasenaTemporal = generarContrasenaTemporal();
    let entregarContrasena = true;

    const usuarioId = await this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      const rolCliente = await tx.rol.findFirst({ where: { nombre: ROL_CLIENTE, organizacionId: null }, select: { id: true } });
      if (!rolCliente) throw new BadRequestException('Falta el rol CLIENTE: vuelve a cargar los datos iniciales.');

      let usuario = await tx.usuario.findUnique({ where: { correo }, select: { id: true, isSuperAdmin: true } });
      if (usuario) {
        if (usuario.isSuperAdmin) throw new BadRequestException('Ese correo es de una cuenta de la plataforma. Usa otro correo.');
        // Una sola asignación por persona y gimnasio: si ya tiene una aquí
        // (equipo u otro cliente), no puede ser además este cliente.
        const aqui = await tx.asignacionAcceso.findFirst({
          where: { usuarioId: usuario.id, organizacionId },
          select: { rol: { select: { nombre: true, organizacionId: true } } },
        });
        if (aqui) {
          throw new ConflictException(
            esRolCliente(aqui.rol)
              ? 'Ese correo ya es la cuenta del portal de otro cliente. Usa otro correo.'
              : 'Ese correo es de alguien del equipo de este gimnasio. Usa otro correo.',
          );
        }
        entregarContrasena = await cuentaSoloDeEstaOrganizacion(this.prisma, usuario.id, organizacionId);
        if (entregarContrasena) {
          await tx.usuario.update({ where: { id: usuario.id }, data: { contrasenaHash: await hashContrasena(contrasenaTemporal) } });
        }
      } else {
        usuario = await tx.usuario.create({
          data: { nombreCompleto: cliente.nombre, correo, telefono: cliente.telefono, contrasenaHash: await hashContrasena(contrasenaTemporal) },
          select: { id: true, isSuperAdmin: true },
        });
      }

      const asignacion = await tx.asignacionAcceso.create({
        // organizacionId lo inyecta la extensión RLS.
        data: { usuarioId: usuario.id, rolId: rolCliente.id } as unknown as Prisma.AsignacionAccesoUncheckedCreateInput,
        select: { id: true, sucursalId: true },
      });
      // Si quien da el acceso está limitado a una sucursal, la extensión le
      // pone esa sucursal a lo que crea. El cliente no: su membresía sirve en
      // todas las sedes (decisión D2), así que su cuenta también.
      if (asignacion.sucursalId) {
        await tx.asignacionAcceso.update({ where: { id: asignacion.id }, data: { sucursalId: null } });
      }
      await tx.cliente.update({
        where: { id: cliente.id },
        // Si la ficha no tenía correo, queda el de la cuenta.
        data: { usuarioId: usuario.id, ...(cliente.correo ? {} : { correo }) },
      });
      return usuario.id;
    });

    await invalidarAccesoVigente(this.redis, usuarioId, organizacionId);
    await registrarAuditoria(this.prisma.extendedClient, {
      tabla: 'clientes',
      operacion: 'UPDATE',
      accion: 'dar_acceso',
      descripcion: `Dio acceso al portal del cliente a ${cliente.nombre} (${correo})`,
    });
    return { correo, contrasenaTemporal: entregarContrasena ? contrasenaTemporal : null };
  }

  // Igual que en Equipo: solo si la cuenta no entra a otro gimnasio.
  async nuevaContrasena(clienteId: string) {
    const cliente = await this.cliente(clienteId);
    if (!cliente.usuarioId) throw new BadRequestException(`${cliente.nombre} no tiene acceso al portal.`);
    const organizacionId = this.cls.get('organizacionId');
    if (!(await cuentaSoloDeEstaOrganizacion(this.prisma, cliente.usuarioId, organizacionId))) {
      throw new BadRequestException(
        `La cuenta de ${cliente.nombre} también se usa en otro gimnasio: solo esa persona puede cambiar su contraseña.`,
      );
    }
    const contrasenaTemporal = generarContrasenaTemporal();
    await this.prisma.extendedClient.usuario.update({
      where: { id: cliente.usuarioId },
      data: { contrasenaHash: await hashContrasena(contrasenaTemporal) },
    });
    await cerrarSesiones(this.redis, cliente.usuarioId, organizacionId);
    await registrarAuditoria(this.prisma.extendedClient, {
      tabla: 'usuarios',
      operacion: 'UPDATE',
      accion: 'restablecer_contrasena',
      descripcion: `Restableció la contraseña del portal de ${cliente.nombre}`,
    });
    return { contrasenaTemporal };
  }

  // La cuenta no se borra (puede entrar a otro gimnasio y, si vuelve, se
  // enlaza de nuevo); solo pierde el acceso a este y se cierran sus sesiones.
  async quitarAcceso(clienteId: string) {
    const cliente = await this.cliente(clienteId);
    if (!cliente.usuarioId) throw new BadRequestException(`${cliente.nombre} no tiene acceso al portal.`);
    const usuarioId = cliente.usuarioId;
    const organizacionId = this.cls.get('organizacionId');

    await this.prisma.extendedClient.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.cliente.update({ where: { id: cliente.id }, data: { usuarioId: null } });
      await tx.asignacionAcceso.deleteMany({ where: { usuarioId, organizacionId, rol: { nombre: ROL_CLIENTE, organizacionId: null } } });
    });
    await cerrarSesiones(this.redis, usuarioId, organizacionId);
    await registrarAuditoria(this.prisma.extendedClient, {
      tabla: 'clientes',
      operacion: 'UPDATE',
      accion: 'revocar_acceso',
      descripcion: `Quitó el acceso al portal del cliente a ${cliente.nombre}`,
    });
    return { ok: true };
  }
}
