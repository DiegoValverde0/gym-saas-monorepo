import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  // Sin este campo, el ValidationPipe global (forbidNonWhitelisted: true)
  // rechaza con 400 cualquier `?deleted=true` -- el query param que
  // DeletedInterceptor lee para activar la vista de papelera (ver
  // deleted.interceptor.ts). Rompía la papelera en todos los módulos que
  // usan PaginationQueryDto en su findAll.
  @IsOptional()
  @IsIn(['true', 'false'])
  deleted?: string;
}
