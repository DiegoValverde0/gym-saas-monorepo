import { PartialType } from '@nestjs/mapped-types';
import { CreateClaseProgramadaDto } from './create-clase-programada.dto';

export class UpdateClaseProgramadaDto extends PartialType(CreateClaseProgramadaDto) {}
