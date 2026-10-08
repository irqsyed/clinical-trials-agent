import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClinicalTrialsController } from './clinical-trials.controller';
import { ClinicalTrialsService } from './clinical-trials.service';
import { QueryOrchestrationService } from './query-orchestration.service';
import { OpenAiModule } from '../openai/openai.module';
import { VisualizationModule } from '../visualization/visualization.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    OpenAiModule,
    VisualizationModule,
  ],
  controllers: [ClinicalTrialsController],
  providers: [ClinicalTrialsService, QueryOrchestrationService],
})
export class ClinicalTrialsModule {}
