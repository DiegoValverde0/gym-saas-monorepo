import { PartialType } from '@nestjs/mapped-types';
import { CreateGastoPlantillaDto } from './create-gasto-plantilla.dto';

export class UpdateGastoPlantillaDto extends PartialType(CreateGastoPlantillaDto) {}
