import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ReporteriaModule } from '../reporteria/reporteria.module';

@Module({
  imports: [ReporteriaModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
