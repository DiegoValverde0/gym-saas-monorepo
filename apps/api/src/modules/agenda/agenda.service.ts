import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { AgendaSemanaDto } from './dto/agenda-semana.dto';
import { aHoraLocal, desdeHoraLocal } from '../../common/utils/zona-horaria.util';
import { formatPermiso } from '../../common/utils/permiso.util';
import { moduloEstaActivo } from '../../common/utils/modulo.util';

const DIA_MS = 24 * 60 * 60_000;
const minutosDe = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const fechaISO = (d: Date) => d.toISOString().slice(0, 10);

export type CoberturaClase = 'cubierta' | 'sin_turno' | 'sin_entrenador';

// Vista consolidada de una semana en una sucursal: turnos del equipo y clases
// en un mismo lugar, con todo ya expresado en la hora local de la
// organización (fecha "YYYY-MM-DD" + minutos desde medianoche), para que el
// frontend solo tenga que dibujar.
@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // Cada mitad de la agenda depende de su propio permiso y módulo: un
  // gimnasio sin "Control de personal" ve solo clases, y viceversa.
  private async permisosDelUsuario(usuarioId: string, organizacionId: string): Promise<string[]> {
    const asignacion = await this.prisma.extendedClient.asignacionAcceso.findFirst({
      where: { usuarioId, organizacionId },
      include: { rol: { include: { rolPermisos: { include: { permiso: true } } } } },
    });
    return asignacion?.rol.rolPermisos.map((rp: { permiso: { modulo: string; accion: string } }) => formatPermiso(rp.permiso.modulo, rp.permiso.accion)) ?? [];
  }

  async semana(dto: AgendaSemanaDto, usuarioId: string) {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) throw new ForbiddenException('Selecciona una organización para ver su agenda.');
    const db = this.prisma.extendedClient;

    const [permisos, clasesActivo, personalActivo, org] = await Promise.all([
      this.permisosDelUsuario(usuarioId, organizacionId),
      moduloEstaActivo(this.prisma, organizacionId, 'clasesGrupales'),
      moduloEstaActivo(this.prisma, organizacionId, 'controlPersonal'),
      db.organizacion.findUnique({ where: { id: organizacionId }, select: { zonaHoraria: true } }),
    ]);
    const verClases = clasesActivo && permisos.includes(formatPermiso('clases', 'leer'));
    const verTurnos = personalActivo && permisos.includes(formatPermiso('turnos', 'leer'));
    if (!verClases && !verTurnos) {
      throw new ForbiddenException('No tienes acceso a clases ni a turnos (o esos módulos no están activos).');
    }
    const zonaHoraria = org?.zonaHoraria ?? null;

    // Lunes de la semana pedida, como fecha local.
    const referencia = dto.fecha ? new Date(`${dto.fecha.slice(0, 10)}T00:00:00Z`) : aHoraLocal(new Date(), zonaHoraria).fechaSolo;
    const offsetLunes = (referencia.getUTCDay() + 6) % 7;
    const lunes = new Date(referencia.getTime() - offsetLunes * DIA_MS);
    const domingo = new Date(lunes.getTime() + 6 * DIA_MS);
    const dias = Array.from({ length: 7 }, (_, i) => fechaISO(new Date(lunes.getTime() + i * DIA_MS)));

    // Los turnos se piden aunque el usuario no pueda verlos si hacen falta
    // para calcular la cobertura de las clases; en ese caso no se devuelven.
    const turnosRaw: Array<{
      id: string;
      staffId: string;
      fecha: Date;
      horaEntrada: Date;
      horaSalida: Date;
      estado: string;
      staff: { usuario: { nombreCompleto: string } | null } | null;
    }> = await db.turnoTrabajo.findMany({
      where: { sucursalId: dto.sucursalId, fecha: { gte: lunes, lte: domingo } },
      include: { staff: { include: { usuario: { select: { nombreCompleto: true } } } } },
      orderBy: [{ fecha: 'asc' }, { horaEntrada: 'asc' }],
    });
    const turnos = turnosRaw.map((t) => ({
      id: t.id,
      staffId: t.staffId,
      staffNombre: t.staff?.usuario?.nombreCompleto ?? 'Sin nombre',
      fecha: fechaISO(t.fecha),
      inicio: minutosDe(t.horaEntrada),
      fin: minutosDe(t.horaSalida),
      estado: t.estado,
    }));
    const turnosVigentes = turnos.filter((t) => t.estado !== 'AUSENTE' && t.estado !== 'CANCELADO');

    let clases: Array<Record<string, unknown>> = [];
    if (verClases) {
      const clasesRaw: Array<{
        id: string;
        nombreClase: string;
        fechaHora: Date;
        duracionMinutos: number;
        capacidadMaxima: number;
        entrenadorId: string | null;
        clasePlantillaId: string | null;
        entrenador: { usuario: { nombreCompleto: string } | null } | null;
        disciplina: { nombre: string } | null;
        _count: { reservas: number };
      }> = await db.claseProgramada.findMany({
        where: {
          sucursalId: dto.sucursalId,
          estado: 'ACTIVO',
          fechaHora: { gte: desdeHoraLocal(lunes, 0, zonaHoraria), lt: desdeHoraLocal(new Date(lunes.getTime() + 7 * DIA_MS), 0, zonaHoraria) },
        },
        include: {
          entrenador: { include: { usuario: { select: { nombreCompleto: true } } } },
          disciplina: { select: { nombre: true } },
          _count: { select: { reservas: { where: { estado: { in: ['CONFIRMADA', 'ASISTIO'] } } } } },
        },
        orderBy: { fechaHora: 'asc' },
      });

      clases = clasesRaw.map((c) => {
        const local = aHoraLocal(c.fechaHora, zonaHoraria);
        const fecha = fechaISO(local.fechaSolo);
        const inicio = local.minutosDelDia;
        let cobertura: CoberturaClase = 'sin_entrenador';
        if (c.entrenadorId) {
          const cubre = turnosVigentes.some(
            (t) => t.staffId === c.entrenadorId && t.fecha === fecha && t.inicio <= inicio && t.fin >= inicio + c.duracionMinutos,
          );
          cobertura = cubre ? 'cubierta' : 'sin_turno';
        }
        return {
          id: c.id,
          nombreClase: c.nombreClase,
          fecha,
          inicio,
          duracionMinutos: c.duracionMinutos,
          capacidadMaxima: c.capacidadMaxima,
          ocupados: c._count.reservas,
          entrenadorId: c.entrenadorId,
          entrenadorNombre: c.entrenador?.usuario?.nombreCompleto ?? null,
          disciplina: c.disciplina?.nombre ?? null,
          recurrente: !!c.clasePlantillaId,
          cobertura,
        };
      });
    }

    return {
      dias,
      hoy: fechaISO(aHoraLocal(new Date(), zonaHoraria).fechaSolo),
      puede: {
        verClases,
        verTurnos,
        crearClases: verClases && permisos.includes(formatPermiso('clases', 'crear')),
      },
      turnos: verTurnos ? turnos : [],
      clases,
    };
  }
}
