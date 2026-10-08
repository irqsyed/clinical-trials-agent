import { z } from 'zod';

// ─── Input DTO ────────────────────────────────────────────────────────────────

export const QueryRequestSchema = z.object({
  query: z
    .string()
    .min(5, 'Query must be at least 5 characters')
    .max(1000, 'Query must be at most 1000 characters')
    .describe('Natural language question about clinical trials'),

  drug_name: z
    .string()
    .optional()
    .describe('Drug or intervention name (e.g., Pembrolizumab)'),

  condition: z
    .string()
    .optional()
    .describe('Disease or condition (e.g., lung cancer)'),

  trial_phase: z
    .enum(['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'EARLY_PHASE1', 'NA'])
    .optional()
    .describe('Trial phase filter'),

  sponsor: z
    .string()
    .optional()
    .describe('Sponsor organization name'),

  country: z
    .string()
    .optional()
    .describe('Country or location filter (e.g., US, Germany)'),

  start_year: z
    .number()
    .int()
    .min(1990)
    .max(2030)
    .optional()
    .describe('Filter trials starting from this year'),

  end_year: z
    .number()
    .int()
    .min(1990)
    .max(2030)
    .optional()
    .describe('Filter trials up to this year'),

  status: z
    .enum(['RECRUITING', 'COMPLETED', 'ACTIVE', 'NOT_YET_RECRUITING', 'TERMINATED', 'WITHDRAWN', 'SUSPENDED'])
    .optional()
    .describe('Trial overall status filter'),
});

export type QueryRequestDto = z.infer<typeof QueryRequestSchema>;

// ─── Output types ─────────────────────────────────────────────────────────────

export const CitationSchema = z.object({
  nct_id: z.string(),
  study_title: z.string().optional(),
  excerpt: z.string().optional(),
  url: z.string().url().optional(),
});

export type Citation = z.infer<typeof CitationSchema>;

export const EncodingSchema = z.object({
  x: z.object({ field: z.string(), label: z.string().optional() }).optional(),
  y: z.object({ field: z.string(), label: z.string().optional(), unit: z.string().optional() }).optional(),
  color: z.object({ field: z.string() }).optional(),
  size: z.object({ field: z.string() }).optional(),
  series: z.object({ field: z.string() }).optional(),
  nodes: z.object({ field: z.string() }).optional(),
  edges: z.object({ field: z.string() }).optional(),
});

export type Encoding = z.infer<typeof EncodingSchema>;

export const VisualizationTypeSchema = z.enum([
  'bar_chart',
  'grouped_bar_chart',
  'time_series',
  'scatter_plot',
  'histogram',
  'network_graph',
  'pie_chart',
  'table',
]);

export type VisualizationType = z.infer<typeof VisualizationTypeSchema>;

export const VisualizationSpecSchema = z.object({
  type: VisualizationTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  encoding: EncodingSchema,
  data: z.array(z.record(z.string(), z.unknown())),
  sorting: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
  time_granularity: z.enum(['year', 'month', 'quarter']).optional(),
});

export type VisualizationSpec = z.infer<typeof VisualizationSpecSchema>;

export const MetaSchema = z.object({
  filters_applied: z.record(z.string(), z.unknown()),
  total_trials_fetched: z.number().int(),
  source: z.literal('clinicaltrials.gov'),
  query_interpretation: z.string(),
  notes: z.array(z.string()).optional(),
  request_id: z.string().optional(),
  processing_time_ms: z.number().optional(),
});

export type Meta = z.infer<typeof MetaSchema>;

export const QueryResponseSchema = z.object({
  visualization: VisualizationSpecSchema,
  meta: MetaSchema,
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;
