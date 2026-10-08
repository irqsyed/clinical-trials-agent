import { Injectable, Logger } from '@nestjs/common';
import { QueryPlan } from '../openai/openai.service';
import { Citation, Encoding, QueryResponse, VisualizationSpec } from '../clinical-trials/dto/query.dto';
import { NormalizedStudy } from '../clinical-trials/types/ct-api.types';

interface DataPoint {
  [key: string]: unknown;
  citations?: Citation[];
}

/**
 * Service for transforming normalized clinical trial data into structured visualization specs.
 * Supports: bar_chart, grouped_bar_chart, time_series, scatter_plot, histogram, network_graph, pie_chart, table.
 */
@Injectable()
export class VisualizationService {
  private readonly logger = new Logger(VisualizationService.name);

  /**
   * Build a full QueryResponse from normalized studies + LLM plan.
   */
  buildResponse(
    studies: NormalizedStudy[],
    plan: QueryPlan,
    filtersApplied: Record<string, unknown>,
    processingTimeMs: number,
  ): QueryResponse {
    this.logger.log(`Building ${plan.visualization_type} for ${studies.length} studies`);

    const vizData = this.buildVisualizationData(studies, plan);

    const visualization: VisualizationSpec = {
      type: plan.visualization_type,
      title: plan.title,
      description: plan.description,
      encoding: this.buildEncoding(plan),
      data: vizData as Record<string, unknown>[],
      ...(plan.sort_by && {
        sorting: {
          field: plan.sort_by,
          direction: (plan.sort_direction as 'asc' | 'desc') ?? 'desc',
        },
      }),
      ...(plan.time_granularity && { time_granularity: plan.time_granularity }),
    };

    return {
      visualization,
      meta: {
        filters_applied: filtersApplied,
        total_trials_fetched: studies.length,
        source: 'clinicaltrials.gov',
        query_interpretation: plan.query_interpretation,
        notes: plan.notes ?? [],
        processing_time_ms: processingTimeMs,
      },
    };
  }

  // ─── Router ─────────────────────────────────────────────────────────────────

  private buildVisualizationData(studies: NormalizedStudy[], plan: QueryPlan): DataPoint[] {
    switch (plan.visualization_type) {
      case 'bar_chart':
      case 'pie_chart':
        return this.buildGroupedCount(studies, plan);
      case 'grouped_bar_chart':
        return this.buildGroupedBarData(studies, plan);
      case 'time_series':
        return this.buildTimeSeriesData(studies, plan);
      case 'scatter_plot':
        return this.buildScatterData(studies, plan);
      case 'histogram':
        return this.buildHistogramData(studies, plan);
      case 'network_graph':
        return this.buildNetworkGraphData(studies, plan);
      case 'table':
        return this.buildTableData(studies);
      default:
        return this.buildGroupedCount(studies, plan);
    }
  }

  // ─── Bar chart / Pie chart ───────────────────────────────────────────────────

  private buildGroupedCount(studies: NormalizedStudy[], plan: QueryPlan): DataPoint[] {
    const field = plan.grouping_field;
    const buckets = new Map<string, { count: number; enrollment: number; studies: NormalizedStudy[] }>();

    for (const study of studies) {
      const keys = this.extractFieldValues(study, field);
      for (const key of keys) {
        if (!buckets.has(key)) {
          buckets.set(key, { count: 0, enrollment: 0, studies: [] });
        }
        const bucket = buckets.get(key)!;
        bucket.count++;
        bucket.enrollment += study.enrollment ?? 0;
        bucket.studies.push(study);
      }
    }

    const result: DataPoint[] = [];
    for (const [label, bucket] of buckets.entries()) {
      const citations = this.buildCitations(bucket.studies.slice(0, 5));

      if (plan.aggregation === 'count') {
        result.push({ [field]: label, trial_count: bucket.count, citations });
      } else if (plan.aggregation === 'sum_enrollment') {
        result.push({ [field]: label, total_enrollment: bucket.enrollment, citations });
      } else if (plan.aggregation === 'avg_enrollment') {
        result.push({
          [field]: label,
          avg_enrollment: bucket.count > 0 ? Math.round(bucket.enrollment / bucket.count) : 0,
          citations,
        });
      } else {
        result.push({ [field]: label, trial_count: bucket.count, citations });
      }
    }

    // Sort
    const sortField = plan.sort_by ?? (plan.aggregation === 'count' ? 'trial_count' : 'total_enrollment');
    result.sort((a, b) => {
      const av = Number(a[sortField] ?? 0);
      const bv = Number(b[sortField] ?? 0);
      return plan.sort_direction === 'asc' ? av - bv : bv - av;
    });

    return result;
  }

  // ─── Grouped bar chart ───────────────────────────────────────────────────────

  private buildGroupedBarData(studies: NormalizedStudy[], plan: QueryPlan): DataPoint[] {
    // Group by (field, year)
    const field = plan.grouping_field;
    const buckets = new Map<string, Map<number, { count: number; studies: NormalizedStudy[] }>>();

    for (const study of studies) {
      const year = study.start_year;
      if (!year) continue;
      const keys = this.extractFieldValues(study, field);
      for (const key of keys) {
        if (!buckets.has(key)) buckets.set(key, new Map());
        const yearBucket = buckets.get(key)!;
        if (!yearBucket.has(year)) yearBucket.set(year, { count: 0, studies: [] });
        yearBucket.get(year)!.count++;
        yearBucket.get(year)!.studies.push(study);
      }
    }

    const result: DataPoint[] = [];
    for (const [label, yearMap] of buckets.entries()) {
      for (const [year, bucket] of yearMap.entries()) {
        result.push({
          [field]: label,
          year,
          trial_count: bucket.count,
          citations: this.buildCitations(bucket.studies.slice(0, 3)),
        });
      }
    }

    result.sort((a, b) => (Number(a.year) - Number(b.year)) || String(a[field]).localeCompare(String(b[field])));
    return result;
  }

  // ─── Time series ─────────────────────────────────────────────────────────────

  private buildTimeSeriesData(studies: NormalizedStudy[], plan: QueryPlan): DataPoint[] {
    const yearBuckets = new Map<number, { count: number; enrollment: number; studies: NormalizedStudy[] }>();

    for (const study of studies) {
      const year = study.start_year;
      if (!year) continue;
      if (!yearBuckets.has(year)) {
        yearBuckets.set(year, { count: 0, enrollment: 0, studies: [] });
      }
      const bucket = yearBuckets.get(year)!;
      bucket.count++;
      bucket.enrollment += study.enrollment ?? 0;
      bucket.studies.push(study);
    }

    const result: DataPoint[] = [];
    for (const [year, bucket] of yearBuckets.entries()) {
      result.push({
        year,
        trial_count: bucket.count,
        total_enrollment: bucket.enrollment,
        avg_enrollment: bucket.count > 0 ? Math.round(bucket.enrollment / bucket.count) : 0,
        citations: this.buildCitations(bucket.studies.slice(0, 3)),
      });
    }

    result.sort((a, b) => Number(a.year) - Number(b.year));
    return result;
  }

  // ─── Scatter plot ─────────────────────────────────────────────────────────────

  private buildScatterData(studies: NormalizedStudy[], plan: QueryPlan): DataPoint[] {
    return studies
      .filter((s) => s.start_year !== null && s.enrollment !== null)
      .map((s) => ({
        nct_id: s.nct_id,
        title: s.title,
        year: s.start_year,
        enrollment: s.enrollment,
        phase: s.phases[0] ?? 'NA',
        status: s.status,
        sponsor: s.sponsor,
        citations: this.buildCitations([s]),
      }));
  }

  // ─── Histogram ───────────────────────────────────────────────────────────────

  private buildHistogramData(studies: NormalizedStudy[], plan: QueryPlan): DataPoint[] {
    const values = studies
      .map((s) => s.enrollment)
      .filter((v): v is number => v !== null && v > 0);

    if (values.length === 0) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(20, Math.ceil(Math.sqrt(values.length)));
    const binSize = Math.ceil((max - min + 1) / binCount);

    const bins: Map<number, { count: number; studies: NormalizedStudy[] }> = new Map();

    for (let i = 0; i < binCount; i++) {
      bins.set(min + i * binSize, { count: 0, studies: [] });
    }

    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const binStart = min + Math.floor((value - min) / binSize) * binSize;
      if (!bins.has(binStart)) bins.set(binStart, { count: 0, studies: [] });
      bins.get(binStart)!.count++;
      if (studies[i]) bins.get(binStart)!.studies.push(studies[i]);
    }

    const result: DataPoint[] = [];
    for (const [binStart, bucket] of bins.entries()) {
      if (bucket.count === 0) continue;
      result.push({
        bin_start: binStart,
        bin_end: binStart + binSize - 1,
        bin_label: `${binStart}–${binStart + binSize - 1}`,
        count: bucket.count,
        citations: this.buildCitations(bucket.studies.slice(0, 3)),
      });
    }

    result.sort((a, b) => Number(a.bin_start) - Number(b.bin_start));
    return result;
  }

  // ─── Network graph ────────────────────────────────────────────────────────────

  private buildNetworkGraphData(studies: NormalizedStudy[], plan: QueryPlan): DataPoint[] {
    const nodeType = plan.node_type ?? 'sponsor';
    const edgeType = plan.edge_type ?? 'shared_condition';

    const nodes = new Map<string, { id: string; type: string; count: number }>();
    const edges = new Map<string, { source: string; target: string; weight: number; studies: string[] }>();

    for (const study of studies) {
      const primaryNodes = this.extractFieldValues(study, nodeType);
      const secondaryField = edgeType === 'shared_condition'
        ? 'condition'
        : edgeType === 'shared_intervention'
          ? 'intervention'
          : 'sponsor';
      const secondaryNodes = this.extractFieldValues(study, secondaryField);

      for (const node of primaryNodes) {
        if (!nodes.has(node)) nodes.set(node, { id: node, type: nodeType, count: 0 });
        nodes.get(node)!.count++;
      }

      // Build edges between primary nodes if they share a secondary attribute
      if (primaryNodes.length > 1) {
        for (let i = 0; i < primaryNodes.length; i++) {
          for (let j = i + 1; j < primaryNodes.length; j++) {
            const edgeKey = [primaryNodes[i], primaryNodes[j]].sort().join('|||');
            if (!edges.has(edgeKey)) {
              edges.set(edgeKey, {
                source: primaryNodes[i],
                target: primaryNodes[j],
                weight: 0,
                studies: [],
              });
            }
            const edge = edges.get(edgeKey)!;
            edge.weight++;
            edge.studies.push(study.nct_id);
          }
        }
      }

      // Build edges: primary node → shared secondary attribute
      for (const primary of primaryNodes) {
        for (const secondary of secondaryNodes) {
          if (primary === secondary) continue;
          const secId = `${secondaryField}:${secondary}`;
          if (!nodes.has(secId)) nodes.set(secId, { id: secId, type: secondaryField, count: 0 });
          nodes.get(secId)!.count++;

          const edgeKey = [primary, secId].sort().join('|||');
          if (!edges.has(edgeKey)) {
            edges.set(edgeKey, { source: primary, target: secId, weight: 0, studies: [] });
          }
          const edge = edges.get(edgeKey)!;
          edge.weight++;
          if (!edge.studies.includes(study.nct_id)) edge.studies.push(study.nct_id);
        }
      }
    }

    // Return combined nodes + edges as a flat array with a discriminator field
    const nodesArr: DataPoint[] = [...nodes.values()].slice(0, 100).map((n) => ({
      element_type: 'node',
      ...n,
    }));

    const edgesArr: DataPoint[] = [...edges.values()]
      .filter((e) => e.weight >= 2)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 200)
      .map((e) => ({
        element_type: 'edge',
        source: e.source,
        target: e.target,
        weight: e.weight,
        citations: e.studies.slice(0, 5).map((nctId) => ({
          nct_id: nctId,
          url: `https://clinicaltrials.gov/study/${nctId}`,
        })),
      }));

    return [...nodesArr, ...edgesArr];
  }

  // ─── Table ────────────────────────────────────────────────────────────────────

  private buildTableData(studies: NormalizedStudy[]): DataPoint[] {
    return studies.slice(0, 100).map((s) => ({
      nct_id: s.nct_id,
      title: s.title,
      status: s.status,
      phase: s.phases.join(', ') || 'N/A',
      sponsor: s.sponsor,
      conditions: s.conditions.join(', '),
      start_year: s.start_year,
      enrollment: s.enrollment,
      countries: s.countries.join(', '),
      url: s.url,
      citations: this.buildCitations([s]),
    }));
  }

  // ─── Encoding builder ─────────────────────────────────────────────────────────

  private buildEncoding(plan: QueryPlan): Encoding {
    switch (plan.visualization_type) {
      case 'bar_chart':
      case 'pie_chart':
        return {
          x: { field: plan.grouping_field, label: plan.x_label ?? plan.grouping_field },
          y: {
            field: this.aggregationToField(plan.aggregation),
            label: plan.y_label ?? 'Count',
          },
        };

      case 'grouped_bar_chart':
        return {
          x: { field: 'year', label: 'Year' },
          y: { field: 'trial_count', label: 'Number of Trials' },
          series: { field: plan.grouping_field },
          color: { field: plan.grouping_field },
        };

      case 'time_series':
        return {
          x: { field: 'year', label: 'Year' },
          y: {
            field: this.aggregationToField(plan.aggregation),
            label: plan.y_label ?? 'Count',
          },
        };

      case 'scatter_plot':
        return {
          x: { field: 'year', label: 'Start Year' },
          y: { field: 'enrollment', label: 'Enrollment Count' },
          color: { field: 'phase' },
          size: { field: 'enrollment' },
        };

      case 'histogram':
        return {
          x: { field: 'bin_label', label: 'Enrollment Range' },
          y: { field: 'count', label: 'Number of Trials' },
        };

      case 'network_graph':
        return {
          nodes: { field: 'id' },
          edges: { field: 'weight' },
        };

      case 'table':
        return {
          x: { field: 'nct_id' },
          y: { field: 'title' },
        };

      default:
        return {
          x: { field: plan.grouping_field },
          y: { field: 'trial_count' },
        };
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private extractFieldValues(study: NormalizedStudy, field: string): string[] {
    switch (field) {
      case 'phase':
        return study.phases.length > 0 ? study.phases : ['N/A'];
      case 'status':
        return [study.status];
      case 'year':
        return study.start_year ? [String(study.start_year)] : [];
      case 'sponsor':
        return [study.sponsor];
      case 'sponsor_class':
        return [study.sponsor_class];
      case 'country':
        return study.countries.length > 0 ? study.countries : ['Unknown'];
      case 'condition':
        return study.conditions.length > 0 ? study.conditions.slice(0, 3) : ['Unknown'];
      case 'intervention':
        return study.interventions.length > 0 ? study.interventions.slice(0, 3) : ['Unknown'];
      case 'study_type':
        return [study.study_type];
      case 'enrollment':
        return study.enrollment !== null ? [String(study.enrollment)] : [];
      default:
        return ['Unknown'];
    }
  }

  private buildCitations(studies: NormalizedStudy[]): Citation[] {
    return studies.map((s) => ({
      nct_id: s.nct_id,
      study_title: s.title,
      excerpt: s.brief_summary ? s.brief_summary.substring(0, 200).trim() + '...' : undefined,
      url: s.url,
    }));
  }

  private aggregationToField(agg: string): string {
    switch (agg) {
      case 'sum_enrollment':
        return 'total_enrollment';
      case 'avg_enrollment':
        return 'avg_enrollment';
      default:
        return 'trial_count';
    }
  }
}
