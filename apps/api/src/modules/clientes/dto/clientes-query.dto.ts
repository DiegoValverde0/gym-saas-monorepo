import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ClientesQueryDto extends PaginationQueryDto {
  // Búsqueda por nombre, documento o correo, resuelta en la base de datos.
  // Sin esto, pantallas como el control de acceso filtraban en el navegador
  // solo la primera página (50 clientes) y el resto nunca aparecía.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
