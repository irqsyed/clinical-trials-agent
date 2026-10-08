import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AppConfig } from '../config/configuration';
import { QueryRequestDto } from './dto/query.dto';
import { CtApiResponse, CtStudy, NormalizedStudy } from './types/ct-api.types';

export interface FetchOptions {
  maxStudies?: number;
  fields?: string[];
}

/**
 * Service responsible for fetching and normalizing data from ClinicalTrials.gov v2 API.
 */
@Injectable()
export class ClinicalTrialsService {
  private readonly logger = new Logger(ClinicalTrialsService.name);
  private readonly baseUrl: string;
  private readonly defaultPageSize: number;

  // Fields we always request from the API (minimized for performance)
  private readonly defaultFields = [
    'NCTId',
    'BriefTitle',
    'OfficialTitle',
    'OverallStatus',
    'Phase',
    'StartDate',
    'CompletionDate',
    'EnrollmentCount',
    'LeadSponsorName',
    'LeadSponsorClass',
    'Condition',
    'InterventionName',
    'LocationCountry',
    'StudyType',
    'BriefSummary',
    'StartDateType',
    'CompletionDateType',
    'EnrollmentType',
    'PrimaryCompletionDate',
  ];

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig>,
  ) {
    this.baseUrl = this.config.get('clinicalTrials.baseUrl', { infer: true }) as string;
    this.defaultPageSize = this.config.get('clinicalTrials.pageSize', { infer: true }) as number;
  }

  /**
   * Build query params from a user DTO + optional extra params.
   */
  buildQueryParams(dto: QueryRequestDto): Record<string, string> {
    const params: Record<string, string> = {};

    // Build query expression
    const queryParts: string[] = [];

    if (dto.drug_name) {
      queryParts.push(`INTERVENTION:"${dto.drug_name}"`);
    }
    if (dto.condition) {
      queryParts.push(`CONDITION:"${dto.condition}"`);
    }
    if (dto.sponsor) {
      queryParts.push(`LEAD_SPONSOR:"${dto.sponsor}"`);
    }

    if (queryParts.length > 0) {
      params['query.term'] = queryParts.join(' AND ');
    }

    // Phase filter
    if (dto.trial_phase) {
      params['filter.phase'] = this.mapPhase(dto.trial_phase);
    }

    // Status filter
    if (dto.status) {
      params['filter.overallStatus'] = dto.status;
    }

    // Date filters via advanced expression
    if (dto.start_year || dto.end_year) {
      const dateFilters: string[] = [];
      if (dto.start_year) {
        dateFilters.push(`AREA[StartDate]RANGE[${dto.start_year}-01-01,MAX]`);
      }
      if (dto.end_year) {
        dateFilters.push(`AREA[StartDate]RANGE[MIN,${dto.end_year}-12-31]`);
      }
      if (dateFilters.length > 0) {
        const existing = params['query.term'] ?? '';
        params['query.term'] = [existing, ...dateFilters].filter(Boolean).join(' AND ');
      }
    }

    // Country filter
    if (dto.country) {
      params['filter.geo'] = `distance(${dto.country})`;
      // Fallback: use query.term for country
      const existing = params['query.term'] ?? '';
      params['query.term'] = [existing, `AREA[LocationCountry]"${dto.country}"`]
        .filter(Boolean)
        .join(' AND ');
    }

    return params;
  }

  /**
   * Fetch studies from ClinicalTrials.gov v2 API with pagination support.
   */
  async fetchStudies(
    dto: QueryRequestDto,
    options: FetchOptions = {},
    extraParams: Record<string, string> = {},
  ): Promise<CtStudy[]> {
    const maxStudies = options.maxStudies ?? this.defaultPageSize;
    const params = {
      ...this.buildQueryParams(dto),
      ...extraParams,
      pageSize: String(Math.min(maxStudies, 1000)),
      format: 'json',
    };

    this.logger.log(`Fetching studies with params: ${JSON.stringify(params)}`);

    const allStudies: CtStudy[] = [];
    let nextPageToken: string | undefined;

    do {
      const requestParams = nextPageToken
        ? { ...params, pageToken: nextPageToken }
        : params;

      try {
        const response = await firstValueFrom(
          this.http.get<CtApiResponse>(`${this.baseUrl}/studies`, {
            params: requestParams,
            timeout: 30000,
          }),
        );

        const data = response.data;
        const studies = data.studies ?? [];
        allStudies.push(...studies);
        nextPageToken = data.nextPageToken;

        this.logger.log(`Fetched ${studies.length} studies (total: ${allStudies.length})`);
      } catch (error) {
        this.logger.error(`ClinicalTrials API error: ${(error as Error).message}`);
        break;
      }
    } while (nextPageToken && allStudies.length < maxStudies);

    return allStudies.slice(0, maxStudies);
  }

  /**
   * Normalize a raw CT study into a flat, easy-to-use structure.
   */
  normalizeStudy(study: CtStudy): NormalizedStudy {
    const protocol = study.protocolSection ?? {};
    const id = protocol.identificationModule ?? {};
    const status = protocol.statusModule ?? {};
    const design = protocol.designModule ?? {};
    const sponsor = protocol.sponsorCollaboratorsModule ?? {};
    const conditions = protocol.conditionsModule ?? {};
    const interventions = protocol.interventionsModule ?? {};
    const locations = protocol.contactsLocationsModule ?? {};
    const description = protocol.descriptionModule ?? {};

    const nctId = id.nctId ?? 'UNKNOWN';
    const startDateStr = status.startDateStruct?.date;
    const completionDateStr = status.completionDateStruct?.date;

    return {
      nct_id: nctId,
      title: id.briefTitle ?? id.officialTitle ?? 'Unknown Title',
      status: status.overallStatus ?? 'Unknown',
      phases: design.phases ?? [],
      start_year: this.extractYear(startDateStr),
      completion_year: this.extractYear(completionDateStr),
      enrollment: design.enrollmentInfo?.count ?? null,
      sponsor: sponsor.leadSponsor?.name ?? 'Unknown',
      sponsor_class: sponsor.leadSponsor?.class ?? 'Unknown',
      conditions: conditions.conditions ?? [],
      interventions: (interventions.interventions ?? []).map((i) => i.name ?? '').filter(Boolean),
      countries: [
        ...new Set(
          (locations.locations ?? [])
            .map((l) => l.facility?.address?.country)
            .filter((c): c is string => Boolean(c)),
        ),
      ],
      study_type: design.studyType ?? 'Unknown',
      brief_summary: description.briefSummary ?? '',
      url: `https://clinicaltrials.gov/study/${nctId}`,
    };
  }

  /**
   * Normalize a list of raw CT studies.
   */
  normalizeStudies(studies: CtStudy[]): NormalizedStudy[] {
    return studies.map((s) => this.normalizeStudy(s));
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private extractYear(dateStr?: string): number | null {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{4})/);
    return match ? parseInt(match[1], 10) : null;
  }

  private mapPhase(phase: string): string {
    const map: Record<string, string> = {
      PHASE1: 'PHASE1',
      PHASE2: 'PHASE2',
      PHASE3: 'PHASE3',
      PHASE4: 'PHASE4',
      EARLY_PHASE1: 'EARLY_PHASE1',
      NA: 'NA',
    };
    return map[phase] ?? phase;
  }
}
