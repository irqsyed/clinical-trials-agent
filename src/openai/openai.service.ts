import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AppConfig } from '../config/configuration';
import { QueryRequestDto, VisualizationType } from '../clinical-trials/dto/query.dto';

export interface QueryPlan {
  visualization_type: VisualizationType;
  title: string;
  description: string;
  query_interpretation: string;
  grouping_field: string;
  aggregation: 'count' | 'sum_enrollment' | 'avg_enrollment' | 'year_distribution';
  sort_by?: string;
  sort_direction?: 'asc' | 'desc';
  time_granularity?: 'year' | 'month' | 'quarter';
  // For network graphs
  node_type?: 'sponsor' | 'condition' | 'intervention' | 'country';
  edge_type?: 'shared_condition' | 'shared_intervention' | 'shared_sponsor';
  // X/Y axis labels for frontend
  x_label?: string;
  y_label?: string;
  notes?: string[];
}

const TOOL_DEFINITION: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'plan_visualization',
    description:
      'Plan the visualization type and data transformation strategy for a clinical trials query.',
    parameters: {
      type: 'object',
      required: [
        'visualization_type',
        'title',
        'description',
        'query_interpretation',
        'grouping_field',
        'aggregation',
      ],
      properties: {
        visualization_type: {
          type: 'string',
          enum: [
            'bar_chart',
            'grouped_bar_chart',
            'time_series',
            'scatter_plot',
            'histogram',
            'network_graph',
            'pie_chart',
            'table',
          ],
          description:
            'Type of visualization most appropriate for the query.',
        },
        title: {
          type: 'string',
          description: 'Human-readable chart title.',
        },
        description: {
          type: 'string',
          description: 'One-sentence description of what the chart shows.',
        },
        query_interpretation: {
          type: 'string',
          description: 'How the system interpreted the user\'s query.',
        },
        grouping_field: {
          type: 'string',
          enum: [
            'phase',
            'status',
            'year',
            'sponsor',
            'sponsor_class',
            'country',
            'condition',
            'intervention',
            'study_type',
            'enrollment',
          ],
          description: 'Which field to group/aggregate the data by.',
        },
        aggregation: {
          type: 'string',
          enum: ['count', 'sum_enrollment', 'avg_enrollment', 'year_distribution'],
          description: 'Aggregation method.',
        },
        sort_by: { type: 'string', description: 'Field to sort by.' },
        sort_direction: {
          type: 'string',
          enum: ['asc', 'desc'],
        },
        time_granularity: {
          type: 'string',
          enum: ['year', 'month', 'quarter'],
          description: 'For time_series charts.',
        },
        node_type: {
          type: 'string',
          enum: ['sponsor', 'condition', 'intervention', 'country'],
          description: 'For network_graph: what the nodes represent.',
        },
        edge_type: {
          type: 'string',
          enum: ['shared_condition', 'shared_intervention', 'shared_sponsor'],
          description: 'For network_graph: what an edge represents.',
        },
        x_label: { type: 'string' },
        y_label: { type: 'string' },
        notes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Any assumptions or caveats.',
        },
      },
    },
  },
};

/**
 * Service for communicating with OpenAI to interpret queries and plan visualizations.
 */
@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const apiKey = this.config.get('openai.apiKey', { infer: true }) as string;
    this.model = (this.config.get('openai.model', { infer: true }) as string) ?? 'gpt-4o-mini';
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Interprets the user query and returns a structured visualization plan.
   * Uses OpenAI function/tool-calling to avoid freeform hallucinations.
   */
  async interpretQuery(dto: QueryRequestDto): Promise<QueryPlan> {
    const systemPrompt = `You are an expert clinical-trials data analyst.
Your job is to interpret a user's natural language question about clinical trials
and determine the best visualization type and data grouping strategy.

Available data fields per trial:
- nct_id, title, status, phases (array), start_year, completion_year,
  enrollment (number of participants), sponsor, sponsor_class (INDUSTRY | NIH | OTHER_GOV | FED | INDIV | NETWORK | U_FED | UNKNOWN | AMBIG),
  conditions (array), interventions (array), countries (array), study_type, brief_summary

Visualization types:
- bar_chart: counts or values per discrete category (e.g., trials per phase)
- grouped_bar_chart: compare across 2 dimensions (e.g., trials per phase per year)
- time_series: trends over time (start_year or completion_year)
- scatter_plot: relationship between 2 numeric variables (e.g., enrollment vs year)
- histogram: distribution of a numeric value (e.g., enrollment)
- network_graph: relationships between entities (sponsors, conditions, interventions, countries)
- pie_chart: proportion of categories (use sparingly, only when <8 categories expected)
- table: structured listing when no aggregation needed

Always use tool calling. Do not return plain text.`;

    const userContent = `User query: "${dto.query}"
Additional context provided: ${JSON.stringify({
      drug_name: dto.drug_name,
      condition: dto.condition,
      trial_phase: dto.trial_phase,
      sponsor: dto.sponsor,
      country: dto.country,
      start_year: dto.start_year,
      end_year: dto.end_year,
      status: dto.status,
    })}

Plan the best visualization for this query.`;

    this.logger.log(`Calling OpenAI model: ${this.model}`);

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'function', function: { name: 'plan_visualization' } },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0] as
      | { function: { name: string; arguments: string } }
      | undefined;
    if (!toolCall || toolCall.function.name !== 'plan_visualization') {
      throw new Error('OpenAI did not return a valid tool call');
    }

    const plan = JSON.parse(toolCall.function.arguments) as QueryPlan;
    this.logger.log(`Query plan: ${JSON.stringify(plan)}`);
    return plan;
  }
}
