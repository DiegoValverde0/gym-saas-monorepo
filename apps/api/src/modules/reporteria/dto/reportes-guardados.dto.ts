import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VisibilidadCarpetaReporte } from '@prisma/client';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CrearCarpetaDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ponle un nombre a la carpeta.' })
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsEnum(VisibilidadCarpetaReporte)
  visibilidad?: VisibilidadCarpetaReporte;

  // Vacío con COMPARTIDA = todo el equipo con reportes:leer.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  rolesIds?: string[];
}

export class ActualizarCarpetaDto extends PartialType(CrearCarpetaDto) {}

export class GuardarReporteDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'Ponle un nombre al reporte.' })
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  // null o ausente = "Mis reportes" (privado).
  @IsOptional()
  @IsUUID()
  carpetaId?: string | null;

  @IsObject()
  definicion: Record<string, unknown>;
}

export class ActualizarReporteDto extends PartialType(GuardarReporteDto) {}

export class DuplicarReporteDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsUUID()
  carpetaId?: string | null;
}

export class EjecutarGuardadoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  // Hasta 2.000: la impresión pide todo lo que se ve en pantalla de una vez.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  porPagina?: number;

  // Cambios de un momento en los filtros rápidos (fecha y sucursal), sin
  // guardar el reporte. Se validan con la definición en validarDefinicion().
  @IsOptional()
  @IsObject()
  filtros?: { fecha?: Record<string, unknown>; sucursalId?: string | null };

  // false: no se cuenta como una ejecución (las tarjetas del Inicio corren su
  // reporte en cada visita; si contaran, llenarían "Recientes" con plantillas
  // que nadie abrió).
  @IsOptional()
  @IsBoolean()
  contar?: boolean;
}

const VISTAS_REPORTES = ['todos', 'recientes', 'mios', 'compartidos', 'plantillas'] as const;

export class ListarReportesDto {
  @IsOptional()
  @IsIn(VISTAS_REPORTES)
  vista?: (typeof VISTAS_REPORTES)[number];

  @IsOptional()
  @IsUUID()
  carpetaId?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  buscar?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  papelera?: string;
}
