import { Test, TestingModule } from '@nestjs/testing';
import { ClinicalTrialsService } from './clinical-trials.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { CtApiResponse } from './types/ct-api.types';
import { QueryRequestDto } from './dto/query.dto';

const mockRawStudy = {
  protocolSection: {
    identificationModule: {
      nctId: 'NCT01234567',
      briefTitle: 'A Phase 2 Study',
    },
    statusModule: {
      overallStatus: 'COMPLETED',
      startDateStruct: { date: '2018-03-01', type: 'ACTUAL' as const },
      completionDateStruct: { date: '2021-06-30', type: 'ACTUAL' as const },
    },
    designModule: {
      studyType: 'INTERVENTIONAL',
      phases: ['PHASE2'],
      enrollmentInfo: { count: 150, type: 'ACTUAL' as const },
    },
    sponsorCollaboratorsModule: {
      leadSponsor: { name: 'Pfizer', class: 'INDUSTRY' },
    },
    conditionsModule: { conditions: ['Lung Cancer'] },
    interventionsModule: {
      interventions: [{ type: 'DRUG', name: 'Pembrolizumab' }],
    },
    contactsLocationsModule: {
      locations: [
        { facility: { address: { country: 'United States' } } },
        { facility: { address: { country: 'Germany' } } },
      ],
    },
    descriptionModule: { briefSummary: 'A study of Pembrolizumab in lung cancer.' },
  },
};

describe('ClinicalTrialsService', () => {
  let service: ClinicalTrialsService;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const mockApiResponse: CtApiResponse = {
      studies: [mockRawStudy],
      totalCount: 1,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicalTrialsService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn().mockReturnValue(
              of({ data: mockApiResponse, status: 200, headers: {}, config: {}, statusText: 'OK' }),
            ),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'clinicalTrials.baseUrl') return 'https://clinicaltrials.gov/api/v2';
              if (key === 'clinicalTrials.pageSize') return 100;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ClinicalTrialsService>(ClinicalTrialsService);
    httpService = module.get(HttpService);
  });

  describe('normalizeStudy', () => {
    it('should correctly normalize a raw CT study', () => {
      const normalized = service.normalizeStudy(mockRawStudy);

      expect(normalized.nct_id).toBe('NCT01234567');
      expect(normalized.title).toBe('A Phase 2 Study');
      expect(normalized.status).toBe('COMPLETED');
      expect(normalized.phases).toEqual(['PHASE2']);
      expect(normalized.start_year).toBe(2018);
      expect(normalized.completion_year).toBe(2021);
      expect(normalized.enrollment).toBe(150);
      expect(normalized.sponsor).toBe('Pfizer');
      expect(normalized.sponsor_class).toBe('INDUSTRY');
      expect(normalized.conditions).toContain('Lung Cancer');
      expect(normalized.interventions).toContain('Pembrolizumab');
      expect(normalized.url).toContain('NCT01234567');
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalStudy = {
        protocolSection: {
          identificationModule: { nctId: 'NCT99999999' },
        },
      };

      const normalized = service.normalizeStudy(minimalStudy);
      expect(normalized.nct_id).toBe('NCT99999999');
      expect(normalized.phases).toEqual([]);
      expect(normalized.start_year).toBeNull();
      expect(normalized.enrollment).toBeNull();
      expect(normalized.countries).toEqual([]);
    });
  });

  describe('buildQueryParams', () => {
    it('should build query params from drug_name', () => {
      const dto: QueryRequestDto = {
        query: 'Show trials for Pembrolizumab',
        drug_name: 'Pembrolizumab',
      };

      const params = service.buildQueryParams(dto);
      expect(params['query.term']).toContain('Pembrolizumab');
    });

    it('should combine drug_name and condition in query', () => {
      const dto: QueryRequestDto = {
        query: 'Pembrolizumab lung cancer trials',
        drug_name: 'Pembrolizumab',
        condition: 'lung cancer',
      };

      const params = service.buildQueryParams(dto);
      expect(params['query.term']).toContain('Pembrolizumab');
      expect(params['query.term']).toContain('lung cancer');
    });

    it('should include phase filter when provided', () => {
      const dto: QueryRequestDto = {
        query: 'Phase 3 trials',
        trial_phase: 'PHASE3',
      };

      const params = service.buildQueryParams(dto);
      expect(params['filter.phase']).toBe('PHASE3');
    });

    it('should include status filter when provided', () => {
      const dto: QueryRequestDto = {
        query: 'Recruiting trials',
        status: 'RECRUITING',
      };

      const params = service.buildQueryParams(dto);
      expect(params['filter.overallStatus']).toBe('RECRUITING');
    });
  });

  describe('fetchStudies', () => {
    it('should fetch and return studies from API', async () => {
      const dto: QueryRequestDto = {
        query: 'Lung cancer trials',
        condition: 'lung cancer',
      };

      const studies = await service.fetchStudies(dto, { maxStudies: 10 });
      expect(studies).toHaveLength(1);
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });
  });
});
