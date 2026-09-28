import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { desdeHoraLocal } from '../../common/utils/zona-horaria.util';
import type { AuditoriaQueryDto } from './auditoria.controller';

// Acciones que anota common/utils/auditoria.util.ts (y las dos anteriores a
// ese helper: restablecer contraseña y acceso total de plataforma).
export const ACCIONES_AUDITORIA = [
  'eliminar',
  'restaurar',
  'dar_acceso',
  'cambiar_acceso',
  'revocar_acceso',
  'editar_rol',
  'cambiar_precio',
  'cambiar_configuracion',
  'forzar_ingreso',
  'pin_kiosco',
  'cerrar_caja_con_diferencia',
  'restablecer_contrasena',
  'plataforma_acceso_total_administrador',
];

const DIA_MS = 86_400_000;

@Injectable()
export class AuditoriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async listar(q: AuditoriaQueryDto) {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) throw new ForbiddenException('Selecciona una organización.');
    const db = this.prisma.extendedClient;

    let fechaHora: Prisma.DateTimeFilter | undefined;
    if (q.desde || q.hasta) {
      const org = await db.organizacion.findUnique({ where: { id: organizacionId }, select: { zonaHoraria: true } });
      const dia = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
      fechaHora = {
        ...(q.desde && { gte: desdeHoraLocal(dia(q.desde), 0, org?.zonaHoraria) }),
        ...(q.hasta && { lt: desdeHoraLocal(new Date(dia(q.hasta).getTime() + DIA_MS), 0, org?.zonaHoraria) }),
      };
    }

    const where: Prisma.AuditoriaWhereInput = {
      // El filtro de organización deja pasar filas sin organización (de la plataforma).
      organizacionId: { not: null },
      ...(fechaHora && { fechaHora }),
      ...(q.usuarioId && { usuarioId: q.usuarioId }),
      ...(q.accion && { valoresNuevos: { path: ['accion'], equals: q.accion } }),
    };

    const { page, limit, skip, take } = resolverPaginacion(q);
    const [filas, total] = await Promise.all([
      db.auditoria.findMany({
        where,
        orderBy: { fechaHora: 'desc' },
        skip,
        take,
        select: { id: true, fechaHora: true, tablaAfectada: true, ipOrigen: true, valoresNuevos: true, usuario: { select: { id: true, nombreCompleto: true } } },
      }),
      db.auditoria.count({ where }),
    ]);

    const data = (filas as Array<{
      id: string;
      fechaHora: Date;
      tablaAfectada: string;
      ipOrigen: string | null;
      valoresNuevos: unknown;
      usuario: { id: string; nombreCompleto: string } | null;
    }>).map((f) => {
      const nuevos = (f.valoresNuevos ?? {}) as { accion?: string; descripcion?: string };
      return {
        id: f.id,
        fechaHora: f.fechaHora,
        accion: nuevos.accion ?? 'otro',
        // Las filas anteriores al helper no tienen descripción.
        descripcion: nuevos.descripcion ?? descripcionAntigua(nuevos.accion, f.tablaAfectada),
        persona: f.usuario?.nombreCompleto ?? 'Sistema',
        ipOrigen: f.ipOrigen,
      };
    });
    return paginar(data, total, page, limit);
  }
}

function descripcionAntigua(accion: string | undefined, tabla: string): string {
  if (accion === 'restablecer_contrasena') return 'Restableció la contraseña de una persona del equipo';
  if (accion === 'plataforma_acceso_total_administrador') return 'La plataforma dio acceso a todas las sucursales al administrador';
  return `Cambio en ${tabla}`;
}
