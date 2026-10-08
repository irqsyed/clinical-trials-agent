import { Injectable, Logger } from '@nestjs/common';
import { ClinicalTrialsService } from './clinical-trials.service';
import { OpenAiService } from '../openai/openai.service';
import { VisualizationService } from '../visualization/visualization.service';
import { QueryRequestDto, QueryResponse } from './dto/query.dto';

/**
 * Orchestrates the full pipeline:
 * 1. Interpret query with OpenAI → plan
 * 2. Fetch studies from ClinicalTrials.gov
 * 3. Normalize studies
 * 4. Build visualization spec
 */
@Injectable()
export class QueryOrchestrationService {
  private readonly logger = new Logger(QueryOrchestrationService.name);

  constructor(
    private readonly ctService: ClinicalTrialsService,
    private readonly openAiService: OpenAiService,
    private readonly vizService: VisualizationService,
  ) {}

  async processQuery(dto: QueryRequestDto): Promise<QueryResponse> {
    const startTime = Date.now();

    // Step 1: Interpret query using LLM
    this.logger.log('Step 1: Interpreting query with OpenAI...');
    const plan = await this.openAiService.interpretQuery(dto);

    // Step 2: Fetch studies from ClinicalTrials.gov
    this.logger.log('Step 2: Fetching studies from ClinicalTrials.gov...');

    // Network graph needs more data; other types need fewer
    const maxStudies = plan.visualization_type === 'network_graph' ? 500
      : plan.visualization_type === 'table' ? 100
        : plan.visualization_type === 'scatter_plot' ? 300
          : 200;

    const rawStudies = await this.ctService.fetchStudies(dto, { maxStudies });

    // Step 3: Normalize
    this.logger.log('Step 3: Normalizing studies...');
    const normalizedStudies = this.ctService.normalizeStudies(rawStudies);

    // Step 4: Build visualization
    this.logger.log('Step 4: Building visualization spec...');
    const filtersApplied = this.buildFiltersRecord(dto);
    const processingTimeMs = Date.now() - startTime;

    const response = this.vizService.buildResponse(
      normalizedStudies,
      plan,
      filtersApplied,
      processingTimeMs,
    );

    this.logger.log(`Pipeline completed in ${processingTimeMs}ms`);
    return response;
  }

  private buildFiltersRecord(dto: QueryRequestDto): Record<string, unknown> {
    const filters: Record<string, unknown> = { query: dto.query };
    if (dto.drug_name) filters.drug_name = dto.drug_name;
    if (dto.condition) filters.condition = dto.condition;
    if (dto.trial_phase) filters.trial_phase = dto.trial_phase;
    if (dto.sponsor) filters.sponsor = dto.sponsor;
    if (dto.country) filters.country = dto.country;
    if (dto.start_year) filters.start_year = dto.start_year;
    if (dto.end_year) filters.end_year = dto.end_year;
    if (dto.status) filters.status = dto.status;
    return filters;
  }
}
