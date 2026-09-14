import { PartialType } from '@nestjs/mapped-types';
import { CreateCajaRegistradoraDto } from './create-caja-registradora.dto';

export class UpdateCajaRegistradoraDto extends PartialType(CreateCajaRegistradoraDto) {}
