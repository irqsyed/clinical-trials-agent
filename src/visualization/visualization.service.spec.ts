import { Test, TestingModule } from '@nestjs/testing';
import { VisualizationService } from './visualization.service';
import { QueryPlan } from '../openai/openai.service';
import { NormalizedStudy } from '../clinical-trials/types/ct-api.types';

const mockStudies: NormalizedStudy[] = [
  {
    nct_id: 'NCT01234567',
    title: 'A Phase 2 Study of Drug A in Cancer',
    status: 'COMPLETED',
    phases: ['PHASE2'],
    start_year: 2018,
    completion_year: 2021,
    enrollment: 150,
    sponsor: 'Pfizer',
    sponsor_class: 'INDUSTRY',
    conditions: ['Lung Cancer'],
    interventions: ['Drug A'],
    countries: ['US', 'Germany'],
    study_type: 'INTERVENTIONAL',
    brief_summary: 'A study evaluating Drug A for lung cancer treatment.',
    url: 'https://clinicaltrials.gov/study/NCT01234567',
  },
  {
    nct_id: 'NCT89012345',
    title: 'Phase 3 Trial of Drug B',
    status: 'RECRUITING',
    phases: ['PHASE3'],
    start_year: 2020,
    completion_year: null,
    enrollment: 500,
    sponsor: 'Merck',
    sponsor_class: 'INDUSTRY',
    conditions: ['Lung Cancer', 'Breast Cancer'],
    interventions: ['Drug B'],
    countries: ['US'],
    study_type: 'INTERVENTIONAL',
    brief_summary: 'Phase 3 trial for Drug B.',
    url: 'https://clinicaltrials.gov/study/NCT89012345',
  },
  {
    nct_id: 'NCT11111111',
    title: 'Observational Study of Cancer Outcomes',
    status: 'COMPLETED',
    phases: ['NA'],
    start_year: 2015,
    completion_year: 2019,
    enrollment: 1200,
    sponsor: 'NIH',
    sponsor_class: 'NIH',
    conditions: ['Cancer'],
    interventions: [],
    countries: ['US', 'Canada'],
    study_type: 'OBSERVATIONAL',
    brief_summary: 'An observational study.',
    url: 'https://clinicaltrials.gov/study/NCT11111111',
  },
];

describe('VisualizationService', () => {
  let service: VisualizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VisualizationService],
    }).compile();

    service = module.get<VisualizationService>(VisualizationService);
  });

  describe('buildResponse', () => {
    it('should build a bar_chart response correctly', () => {
      const plan: QueryPlan = {
        visualization_type: 'bar_chart',
        title: 'Trials by Phase',
        description: 'Distribution of trials by phase',
        query_interpretation: 'User wants to see trial counts per phase',
        grouping_field: 'phase',
        aggregation: 'count',
        sort_by: 'trial_count',
        sort_direction: 'desc',
      };

      const response = service.buildResponse(mockStudies, plan, { condition: 'cancer' }, 500);

      expect(response.visualization.type).toBe('bar_chart');
      expect(response.visualization.title).toBe('Trials by Phase');
      expect(response.visualization.data.length).toBeGreaterThan(0);
      expect(response.meta.total_trials_fetched).toBe(3);
      expect(response.meta.source).toBe('clinicaltrials.gov');
    });

    it('should include citations in bar_chart data points', () => {
      const plan: QueryPlan = {
        visualization_type: 'bar_chart',
        title: 'Trials by Phase',
        description: 'Phase distribution',
        query_interpretation: 'Phase breakdown',
        grouping_field: 'phase',
        aggregation: 'count',
      };

      const response = service.buildResponse(mockStudies, plan, {}, 100);
      const dataPoint = response.visualization.data[0];

      expect(dataPoint).toHaveProperty('citations');
      expect(Array.isArray(dataPoint.citations)).toBe(true);
      const citations = dataPoint.citations as Array<{ nct_id: string }>;
      expect(citations[0]).toHaveProperty('nct_id');
    });

    it('should build a time_series response', () => {
      const plan: QueryPlan = {
        visualization_type: 'time_series',
        title: 'Trials Over Time',
        description: 'Trial counts by start year',
        query_interpretation: 'Time trend',
        grouping_field: 'year',
        aggregation: 'count',
        time_granularity: 'year',
      };

      const response = service.buildResponse(mockStudies, plan, {}, 100);
      expect(response.visualization.type).toBe('time_series');
      expect(response.visualization.data.length).toBeGreaterThan(0);
      // Should have year, trial_count
      const point = response.visualization.data[0];
      expect(point).toHaveProperty('year');
      expect(point).toHaveProperty('trial_count');
    });

    it('should build a scatter_plot response', () => {
      const plan: QueryPlan = {
        visualization_type: 'scatter_plot',
        title: 'Enrollment vs Year',
        description: 'Scatter of enrollment over time',
        query_interpretation: 'Enrollment vs year',
        grouping_field: 'enrollment',
        aggregation: 'count',
      };

      const response = service.buildResponse(mockStudies, plan, {}, 100);
      expect(response.visualization.type).toBe('scatter_plot');
      const point = response.visualization.data[0];
      expect(point).toHaveProperty('enrollment');
      expect(point).toHaveProperty('year');
    });

    it('should build a histogram response', () => {
      const plan: QueryPlan = {
        visualization_type: 'histogram',
        title: 'Enrollment Distribution',
        description: 'Histogram of enrollment sizes',
        query_interpretation: 'Enrollment histogram',
        grouping_field: 'enrollment',
        aggregation: 'count',
      };

      const response = service.buildResponse(mockStudies, plan, {}, 100);
      expect(response.visualization.type).toBe('histogram');
      expect(response.visualization.data.length).toBeGreaterThan(0);
      const point = response.visualization.data[0];
      expect(point).toHaveProperty('bin_label');
      expect(point).toHaveProperty('count');
    });

    it('should build a network_graph response with nodes and edges', () => {
      const plan: QueryPlan = {
        visualization_type: 'network_graph',
        title: 'Sponsor Network',
        description: 'Network of sponsors and conditions',
        query_interpretation: 'Sponsor-condition network',
        grouping_field: 'sponsor',
        aggregation: 'count',
        node_type: 'sponsor',
        edge_type: 'shared_condition',
      };

      const response = service.buildResponse(mockStudies, plan, {}, 100);
      expect(response.visualization.type).toBe('network_graph');
      const nodes = response.visualization.data.filter((d) => d['element_type'] === 'node');
      expect(nodes.length).toBeGreaterThan(0);
    });

    it('should build a table response', () => {
      const plan: QueryPlan = {
        visualization_type: 'table',
        title: 'Trial Listing',
        description: 'Tabular list of trials',
        query_interpretation: 'List trials',
        grouping_field: 'status',
        aggregation: 'count',
      };

      const response = service.buildResponse(mockStudies, plan, {}, 100);
      expect(response.visualization.type).toBe('table');
      expect(response.visualization.data.length).toBe(3);
      expect(response.visualization.data[0]).toHaveProperty('nct_id');
      expect(response.visualization.data[0]).toHaveProperty('title');
    });

    it('should handle empty studies gracefully', () => {
      const plan: QueryPlan = {
        visualization_type: 'bar_chart',
        title: 'No Results',
        description: 'No data',
        query_interpretation: 'No matching trials',
        grouping_field: 'phase',
        aggregation: 'count',
      };

      const response = service.buildResponse([], plan, {}, 100);
      expect(response.visualization.data).toHaveLength(0);
      expect(response.meta.total_trials_fetched).toBe(0);
    });

    it('should have correct encoding for bar_chart', () => {
      const plan: QueryPlan = {
        visualization_type: 'bar_chart',
        title: 'Test',
        description: 'Test',
        query_interpretation: 'Test',
        grouping_field: 'phase',
        aggregation: 'count',
        x_label: 'Trial Phase',
        y_label: 'Number of Trials',
      };

      const response = service.buildResponse(mockStudies, plan, {}, 100);
      expect(response.visualization.encoding.x?.field).toBe('phase');
      expect(response.visualization.encoding.y?.field).toBe('trial_count');
    });
  });
});
