import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { QueryOrchestrationService } from './query-orchestration.service';
import { QueryRequestSchema, QueryRequestDto, QueryResponse } from './dto/query.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('Clinical Trials Query')
@Controller('query')
export class ClinicalTrialsController {
  constructor(private readonly orchestration: QueryOrchestrationService) {}

  /**
   * POST /query
   * Main endpoint: accepts a natural language query + optional filters,
   * returns a structured visualization specification.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(QueryRequestSchema))
  @ApiOperation({
    summary: 'Query ClinicalTrials.gov with natural language',
    description: `Interprets a natural language question about clinical trials,
      fetches data from ClinicalTrials.gov, and returns a structured visualization
      specification that a frontend can use to render charts.`,
  })
  @ApiBody({
    description: 'Query request with natural language question and optional filters',
    examples: {
      trials_by_phase: {
        summary: 'Trials by phase for a drug',
        value: {
          query: 'Show me the distribution of trials by phase for Pembrolizumab',
          drug_name: 'Pembrolizumab',
        },
      },
      trends_over_time: {
        summary: 'Trial trends over time',
        value: {
          query: 'How has the number of lung cancer trials changed over time?',
          condition: 'lung cancer',
        },
      },
      sponsor_network: {
        summary: 'Sponsor network graph',
        value: {
          query: 'What sponsors are running diabetes trials and how are they connected?',
          condition: 'diabetes',
        },
      },
      enrollment_histogram: {
        summary: 'Enrollment distribution',
        value: {
          query: 'Show the distribution of enrollment sizes for Phase 3 cancer trials',
          condition: 'cancer',
          trial_phase: 'PHASE3',
        },
      },
      scatter_plot: {
        summary: 'Enrollment vs year',
        value: {
          query: 'Show enrollment sizes over time for cardiovascular trials',
          condition: 'cardiovascular disease',
          start_year: 2015,
        },
      },
    },
    schema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          example: 'Show me the distribution of trials by phase for Pembrolizumab',
          minLength: 5,
          maxLength: 1000,
        },
        drug_name: { type: 'string', example: 'Pembrolizumab' },
        condition: { type: 'string', example: 'lung cancer' },
        trial_phase: {
          type: 'string',
          enum: ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'EARLY_PHASE1', 'NA'],
        },
        sponsor: { type: 'string', example: 'Merck' },
        country: { type: 'string', example: 'US' },
        start_year: { type: 'integer', example: 2015, minimum: 1990, maximum: 2030 },
        end_year: { type: 'integer', example: 2023, minimum: 1990, maximum: 2030 },
        status: {
          type: 'string',
          enum: ['RECRUITING', 'COMPLETED', 'ACTIVE', 'NOT_YET_RECRUITING', 'TERMINATED', 'WITHDRAWN', 'SUSPENDED'],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Structured visualization specification',
    schema: {
      type: 'object',
      properties: {
        visualization: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['bar_chart', 'grouped_bar_chart', 'time_series', 'scatter_plot', 'histogram', 'network_graph', 'pie_chart', 'table'],
            },
            title: { type: 'string' },
            description: { type: 'string' },
            encoding: {
              type: 'object',
              properties: {
                x: { type: 'object', properties: { field: { type: 'string' }, label: { type: 'string' } } },
                y: { type: 'object', properties: { field: { type: 'string' }, label: { type: 'string' } } },
                color: { type: 'object', properties: { field: { type: 'string' } } },
              },
            },
            data: { type: 'array', items: { type: 'object' } },
            sorting: {
              type: 'object',
              properties: { field: { type: 'string' }, direction: { type: 'string', enum: ['asc', 'desc'] } },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            filters_applied: { type: 'object' },
            total_trials_fetched: { type: 'integer' },
            source: { type: 'string', example: 'clinicaltrials.gov' },
            query_interpretation: { type: 'string' },
            notes: { type: 'array', items: { type: 'string' } },
            processing_time_ms: { type: 'integer' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error — check request body' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async query(@Body() dto: QueryRequestDto): Promise<QueryResponse> {
    return this.orchestration.processQuery(dto);
  }
}
