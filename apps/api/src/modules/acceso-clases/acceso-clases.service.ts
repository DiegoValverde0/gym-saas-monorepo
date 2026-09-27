import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { AccesoClases, leerAccesoClases, reglaDeDisciplina } from '../../common/utils/acceso-clases.util';
import { combinarConfiguracion } from '../../common/utils/configuracion.util';
import { DisciplinasDelPlanDto, ReglaDisciplinaDto } from './dto/acceso-clases.dto';

// Edición de "quién puede reservar" (plan de simplificación, 8.4, nivel A).
// Las reglas viven en Organizacion.configuracion.accesoClases; este servicio
// las edita desde los dos lugares donde el dueño piensa en ellas: la
// disciplina (asistente de clase) y el plan ("este plan incluye...").
@Injectable()
export class AccesoClasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private async leer() {
    const org = await this.prisma.extendedClient.organizacion.findUnique({
      where: { id: this.cls.get('organizacionId') },
      select: { id: true, configuracion: true },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return { org, acceso: leerAccesoClases(org.configuracion) };
  }

  private async guardar(orgId: string, configuracionActual: unknown, acceso: AccesoClases) {
    // accesoClases se reemplaza completo (no se combina clave por clave):
    // quitar una disciplina de la lista debe quitarla de verdad.
    const configuracion = combinarConfiguracion(configuracionActual, {});
    (configuracion as Record<string, unknown>).accesoClases = acceso;
    await this.prisma.extendedClient.organizacion.update({ where: { id: orgId }, data: { configuracion } });
    return acceso;
  }

  async obtener() {
    return (await this.leer()).acceso;
  }

  async definirReglaDisciplina(disciplinaId: string, dto: ReglaDisciplinaDto) {
    const disciplina = await this.prisma.extendedClient.disciplina.findUnique({ where: { id: disciplinaId }, select: { id: true } });
    if (!disciplina) throw new NotFoundException('La disciplina no existe.');
    if (dto.modo === 'PLANES') {
      if (!dto.planIds?.length) throw new BadRequestException('Elige al menos un plan que pueda reservar esta disciplina.');
      const existentes = await this.prisma.extendedClient.plan.count({ where: { id: { in: dto.planIds } } });
      if (existentes !== dto.planIds.length) throw new BadRequestException('Alguno de los planes elegidos no existe.');
    }
    const { org, acceso } = await this.leer();
    const regla = dto.modo === 'PLANES' ? { modo: dto.modo, planIds: dto.planIds } : { modo: dto.modo };
    return this.guardar(org.id, org.configuracion, { ...acceso, porDisciplina: { ...acceso.porDisciplina, [disciplinaId]: regla } });
  }

  // Marca qué disciplinas incluye un plan, ajustando la regla de cada una:
  //  - ABIERTA: no cambia (cualquiera puede reservar).
  //  - MIEMBROS (todos los planes): si el plan deja de incluirla, pasa a
  //    PLANES con todos los demás planes activos.
  //  - PLANES: se agrega o quita este plan de la lista.
  async definirDisciplinasDelPlan(planId: string, dto: DisciplinasDelPlanDto) {
    const db = this.prisma.extendedClient;
    const plan = await db.plan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!plan) throw new NotFoundException('El plan no existe.');
    const incluidas = new Set(dto.disciplinaIds);
    const disciplinas = await db.disciplina.findMany({ select: { id: true } });
    const otrosPlanes = (await db.plan.findMany({ where: { estado: 'ACTIVO', id: { not: planId } }, select: { id: true } })).map((p) => p.id);

    const { org, acceso } = await this.leer();
    const porDisciplina = { ...acceso.porDisciplina };
    for (const { id } of disciplinas) {
      const regla = reglaDeDisciplina(acceso, id);
      const incluye = incluidas.has(id);
      if (regla.modo === 'ABIERTA') continue;
      if (regla.modo === 'MIEMBROS') {
        if (!incluye) porDisciplina[id] = { modo: 'PLANES', planIds: otrosPlanes };
        continue;
      }
      const planIds = new Set(regla.planIds ?? []);
      if (incluye) planIds.add(planId);
      else planIds.delete(planId);
      porDisciplina[id] = { modo: 'PLANES', planIds: [...planIds] };
    }
    return this.guardar(org.id, org.configuracion, { ...acceso, porDisciplina });
  }
}
