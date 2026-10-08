/**
 * Raw types from the ClinicalTrials.gov v2 API.
 * Based on: https://clinicaltrials.gov/api/v2/studies fields.
 */

export interface CtStudyDate {
  date?: string;
  type?: 'ACTUAL' | 'ESTIMATED';
}

export interface CtPhase {
  phase?: string;
}

export interface CtStatus {
  overallStatus?: string;
  startDateStruct?: CtStudyDate;
  completionDateStruct?: CtStudyDate;
  primaryCompletionDateStruct?: CtStudyDate;
}

export interface CtSponsor {
  leadSponsor?: {
    name?: string;
    class?: string;
  };
  collaborators?: Array<{ name?: string; class?: string }>;
}

export interface CtLocation {
  facility?: { name?: string; address?: { city?: string; country?: string } };
  status?: string;
}

export interface CtIntervention {
  type?: string;
  name?: string;
  description?: string;
}

export interface CtCondition {
  condition?: string;
}

export interface CtArm {
  label?: string;
  type?: string;
  description?: string;
  interventionNames?: string[];
}

export interface CtEnrollment {
  count?: number;
  type?: 'ACTUAL' | 'ESTIMATED';
}

export interface CtStudy {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      officialTitle?: string;
      organization?: { fullName?: string };
    };
    statusModule?: CtStatus;
    designModule?: {
      studyType?: string;
      phases?: string[];
      enrollmentInfo?: CtEnrollment;
      designInfo?: {
        primaryPurpose?: string;
        allocation?: string;
        interventionModel?: string;
        maskingInfo?: { masking?: string };
      };
    };
    sponsorCollaboratorsModule?: CtSponsor;
    conditionsModule?: {
      conditions?: string[];
      keywords?: string[];
    };
    interventionsModule?: {
      interventions?: CtIntervention[];
    };
    contactsLocationsModule?: {
      locations?: CtLocation[];
    };
    descriptionModule?: {
      briefSummary?: string;
      detailedDescription?: string;
    };
    outcomesModule?: {
      primaryOutcomes?: Array<{ measure?: string; description?: string; timeFrame?: string }>;
    };
  };
  derivedSection?: {
    miscInfoModule?: {
      modelPredictions?: Array<{ name?: string; score?: number }>;
    };
  };
}

export interface CtApiResponse {
  studies?: CtStudy[];
  nextPageToken?: string;
  totalCount?: number;
}

// ─── Normalized flat study for internal use ────────────────────────────────────

export interface NormalizedStudy {
  nct_id: string;
  title: string;
  status: string;
  phases: string[];
  start_year: number | null;
  completion_year: number | null;
  enrollment: number | null;
  sponsor: string;
  sponsor_class: string;
  conditions: string[];
  interventions: string[];
  countries: string[];
  study_type: string;
  brief_summary: string;
  url: string;
}
