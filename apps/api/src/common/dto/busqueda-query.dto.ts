import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

// Búsqueda resuelta en la base de datos. Sin esto, las pantallas filtraban
// en el navegador solo la primera página (50 registros) y el resto nunca
// aparecía.
export class BusquedaQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
