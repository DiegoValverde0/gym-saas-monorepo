import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGastoPlantillaDto } from './dto/create-gasto-plantilla.dto';
import { UpdateGastoPlantillaDto } from './dto/update-gasto-plantilla.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginar, resolverPaginacion } from '../../common/utils/pagination.util';
import { CONCEPTOS_EGRESO } from '../transaccion/tipo-concepto.util';

const INCLUDE_PLANTILLA = {
  proveedor: { select: { nombre: true } },
  sucursal: { select: { nombre: true } },
  cuentaBancaria: { select: { banco: true, numeroCuenta: true } },
} as const;

@Injectable()
export class GastoPlantillaService {
  private readonly logger = new Logger(GastoPlantillaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private normalizarFechas<T extends { vigenciaDesde?: string; vigenciaHasta?: string }>(data: T) {
    const result: Record<string, unknown> = { ...data };
    if (data.vigenciaDesde) result.vigenciaDesde = new Date(`${data.vigenciaDesde}T00:00:00Z`);
    if (data.vigenciaHasta) result.vigenciaHasta = new Date(`${data.vigenciaHasta}T00:00:00Z`);
    return result;
  }

  private assertCategoriaEgreso(tipoConcepto: string) {
    if (!CONCEPTOS_EGRESO.has(tipoConcepto as never)) {
      throw new BadRequestException(`La categoría "${tipoConcepto}" no es una categoría de egreso válida para una plantilla de gasto.`);
    }
  }

  async create(dto: CreateGastoPlantillaDto) {
    this.assertCategoriaEgreso(dto.tipoConcepto);
    return this.prisma.extendedClient.gastoPlantilla.create({
      // organizacionId lo inyecta la extensión RLS en runtime (ver prisma.service.ts).
      data: this.normalizarFechas(dto) as unknown as Prisma.GastoPlantillaUncheckedCreateInput,
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const { page, limit, skip, take } = resolverPaginacion(query);
    const [data, total] = await Promise.all([
      this.prisma.extendedClient.gastoPlantilla.findMany({
        include: INCLUDE_PLANTILLA,
        orderBy: { diaDelMes: 'asc' },
        skip,
        take,
      }),
      this.prisma.extendedClient.gastoPlantilla.count(),
    ]);
    return paginar(data, total, page, limit);
  }

  async findOne(id: string) {
    const plantilla = await this.prisma.extendedClient.gastoPlantilla.findUnique({
      where: { id },
      include: INCLUDE_PLANTILLA,
    });
    if (!plantilla) {
      throw new NotFoundException(`Plantilla de gasto con ID ${id} no encontrada`);
    }
    return plantilla;
  }

  async update(id: string, dto: UpdateGastoPlantillaDto) {
    await this.findOne(id);
    if (dto.tipoConcepto) this.assertCategoriaEgreso(dto.tipoConcepto);
    return this.prisma.extendedClient.gastoPlantilla.update({
      where: { id },
      data: this.normalizarFechas(dto) as unknown as Prisma.GastoPlantillaUncheckedUpdateInput,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.extendedClient.gastoPlantilla.delete({ where: { id } });
  }

  async restore(id: string) {
    return this.prisma.extendedClient.gastoPlantilla.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // Disparado manualmente desde el frontend ("Generar gastos del mes ahora"),
  // con el contexto de tenant de la request ya resuelto en el CLS.
  async generarAhora() {
    const organizacionId = this.cls.get('organizacionId');
    if (!organizacionId) return { gastosGenerados: 0 };
    return this.generarParaOrganizacion(organizacionId);
  }

  // Tope a fin de mes: una plantilla con diaDelMes=31 se genera el día 30 en
  // abril/junio/septiembre/noviembre, y el 28/29 en febrero -- mismo criterio
  // que usa cualquier cobro de alquiler/servicio real.
  private diaEfectivoDelMes(fecha: Date, diaDelMes: number): number {
    const ultimoDiaDelMes = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate();
    return Math.min(diaDelMes, ultimoDiaDelMes);
  }

  // Núcleo de la generación. A diferencia de turno-plantilla/clase-plantilla
  // (que proyectan varias semanas hacia adelante), esto SOLO actúa si hoy es
  // el día que le toca a la plantilla -- no tiene sentido pre-asentar en los
  // libros un gasto de un mes que todavía no llegó. Usa `this.prisma` crudo
  // a propósito (cron sin contexto de tenant en el CLS, ver excludedFiles en
  // .eslintrc.js), igual que turno-plantilla.service.ts.
  async generarParaOrganizacion(organizacionId: string) {
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    const plantillas = await this.prisma.gastoPlantilla.findMany({
      where: {
        organizacionId,
        activa: true,
        deletedAt: null,
        vigenciaDesde: { lte: hoy },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }],
      },
    });
    if (plantillas.length === 0) return { gastosGenerados: 0 };

    const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    let generados = 0;

    for (const plantilla of plantillas) {
      if (hoy.getUTCDate() !== this.diaEfectivoDelMes(hoy, plantilla.diaDelMes)) continue;

      // Idempotencia atómica: UPDATE condicional que solo "gana" una vez por
      // mes por plantilla. Reemplaza un findFirst+create previo, que tenía
      // una carrera real entre el cron diario y "Generar ahora" manual
      // (ambos podían pasar el check antes de que cualquiera insertara).
      const reclamado = await this.reclamarMes(plantilla.id, organizacionId, inicioMes);
      if (!reclamado) continue;

      const motivoInvalido = await this.validarReferenciasActivas(plantilla, organizacionId);
      if (motivoInvalido) {
        this.logger.warn(`Plantilla de gasto ${plantilla.id}: se omite este mes (${motivoInvalido}).`);
        continue;
      }

      try {
        await this.crearTransaccionDesdeGastoPlantilla(plantilla, organizacionId);
        generados++;
      } catch (err) {
        // Libera la reclamación para que el próximo intento (mañana, o un
        // "Generar ahora" tras corregir el problema) pueda reintentar.
        await this.prisma.gastoPlantilla.update({ where: { id: plantilla.id }, data: { ultimaGeneracion: null } });
        this.logger.error(`Plantilla de gasto ${plantilla.id}: fallo al generar la transacción: ${(err as Error).message}`);
      }
    }

    return { gastosGenerados: generados };
  }

  // UPDATE condicional atómico: solo actualiza (y devuelve true) si ningún
  // otro disparo ya reclamó este mes para esta plantilla. Evita la carrera
  // TOCTOU de un findFirst+create separado.
  private async reclamarMes(plantillaId: string, organizacionId: string, inicioMes: Date): Promise<boolean> {
    const filas = await this.prisma.$executeRaw`
      UPDATE gastos_plantilla
      SET ultima_generacion = ${inicioMes}
      WHERE id = ${plantillaId}::uuid
        AND organizacion_id = ${organizacionId}::uuid
        AND (ultima_generacion IS NULL OR ultima_generacion < ${inicioMes})
    `;
    return filas > 0;
  }

  // Evita generar (y descontar saldo) contra un proveedor, cuenta bancaria o
  // sucursal que fue archivado/eliminado después de crear la plantilla.
  // Devuelve el motivo si algo ya no es válido, o null si todo está bien.
  private async validarReferenciasActivas(
    plantilla: { proveedorId: string | null; cuentaBancariaId: string; sucursalId: string },
    organizacionId: string,
  ): Promise<string | null> {
    const [cuenta, sucursal, proveedor] = await Promise.all([
      this.prisma.cuentaBancaria.findFirst({ where: { id: plantilla.cuentaBancariaId, organizacionId, deletedAt: null } }),
      this.prisma.sucursal.findFirst({ where: { id: plantilla.sucursalId, organizacionId, deletedAt: null, estado: 'ACTIVO' } }),
      plantilla.proveedorId
        ? this.prisma.proveedor.findFirst({ where: { id: plantilla.proveedorId, organizacionId, deletedAt: null, estado: 'ACTIVO' } })
        : Promise.resolve(true),
    ]);
    if (!cuenta) return 'la cuenta bancaria ya no está activa';
    if (!sucursal) return 'la sucursal ya no está activa';
    if (!proveedor) return 'el proveedor ya no está activo';
    return null;
  }

  private async crearTransaccionDesdeGastoPlantilla(
    plantilla: { id: string; sucursalId: string; proveedorId: string | null; beneficiario: string | null; tipoConcepto: string; descripcion: string | null; monto: Prisma.Decimal; metodoPago: string; cuentaBancariaId: string },
    organizacionId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const transaccion = await tx.transaccion.create({
        data: {
          organizacionId,
          sucursalId: plantilla.sucursalId,
          tipo: 'EGRESO',
          proveedorId: plantilla.proveedorId,
          beneficiario: plantilla.beneficiario,
          montoTotal: plantilla.monto,
        } as unknown as Prisma.TransaccionUncheckedCreateInput,
      });

      await tx.detalleTransaccion.create({
        data: {
          organizacionId,
          transaccionId: transaccion.id,
          tipoConcepto: plantilla.tipoConcepto,
          gastoPlantillaId: plantilla.id,
          descripcionLibre: plantilla.descripcion || undefined,
          cantidad: 1,
          precioUnitario: plantilla.monto,
          subtotal: plantilla.monto,
        } as unknown as Prisma.DetalleTransaccionUncheckedCreateInput,
      });

      await tx.pago.create({
        data: {
          organizacionId,
          transaccionId: transaccion.id,
          metodoPago: plantilla.metodoPago,
          monto: plantilla.monto,
          cuentaBancariaId: plantilla.cuentaBancariaId,
        } as unknown as Prisma.PagoUncheckedCreateInput,
      });

      // Mismo movimiento de saldo que un egreso manual (transaccion.service.ts),
      // pero sin tocar ninguna caja física: la generación automática no tiene
      // una sesión de usuario/turno de caja detrás.
      await tx.cuentaBancaria.update({
        where: { id: plantilla.cuentaBancariaId },
        data: { saldo: { decrement: Number(plantilla.monto) } },
      });

      return transaccion;
    });
  }

  // Mantiene los gastos recurrentes al día para todas las organizaciones
  // activas, sin que nadie tenga que acordarse de generar el del mes.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleGeneracionDiaria() {
    this.logger.log('Generando gastos recurrentes del día desde plantillas activas...');
    const organizaciones = await this.prisma.organizacion.findMany({
      where: { deletedAt: null, estado: 'ACTIVO' },
      select: { id: true },
    });

    for (const org of organizaciones) {
      try {
        const { gastosGenerados } = await this.generarParaOrganizacion(org.id);
        if (gastosGenerados > 0) {
          this.logger.log(`Organización ${org.id}: ${gastosGenerados} gastos recurrentes generados.`);
        }
      } catch (err) {
        this.logger.error(`Fallo generando gastos recurrentes para organización ${org.id}: ${(err as Error).message}`);
      }
    }
  }
}
