import { Module } from '@nestjs/common';
import { VisualizationService } from './visualization.service';

@Module({
  providers: [VisualizationService],
  exports: [VisualizationService],
})
export class VisualizationModule {}
