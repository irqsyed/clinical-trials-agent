# End-to-End System Workflow & Architecture Guide

This document provides a comprehensive, step-by-step technical explanation of how the **ClinicalTrials.gov Query-to-Visualization Agent** processes natural language queries, coordinates with the OpenAI API for structured query planning, pulls authoritative data from the ClinicalTrials.gov API, aggregates statistical metrics with deep citations, and produces a frontend-ready visualization specification.

---

## Table of Contents
1. [Core Design Philosophy](#1-core-design-philosophy)
2. [High-Level Architecture & Lifecycle Diagram](#2-high-level-architecture--lifecycle-diagram)
3. [Step-by-Step Workflow Breakdown](#3-step-by-step-workflow-breakdown)
   - [Step 1: Ingestion & Zod Input Validation](#step-1-ingestion--zod-input-validation)
   - [Step 2: OpenAI as the Planner (Zero-Hallucination Tool Calling)](#step-2-openai-as-the-planner-zero-hallucination-tool-calling)
   - [Step 3: ClinicalTrials.gov v2 API Querying](#step-3-clinicaltrialsgov-v2-api-querying)
   - [Step 4: Normalization & Deterministic Aggregation](#step-4-normalization--deterministic-aggregation)
   - [Step 5: Bonus — Deep Citation Generation & Source Traceability](#step-5-bonus--deep-citation-generation--source-traceability)
   - [Step 6: Frontend Specification & Rendering](#step-6-frontend-specification--rendering)
4. [Concrete Walkthrough Example: Pembrolizumab Query](#4-concrete-walkthrough-example-pembrolizumab-query)
5. [Visualization Type Decision Matrix](#5-visualization-type-decision-matrix)

---

## 1. Core Design Philosophy

The system solves a classic challenge in AI application design: **How to leverage LLMs for reasoning and planning without allowing them to hallucinate factual data.**

In this architecture:
- **The LLM never fabricates data points, numbers, or study counts.**
- The LLM acts solely as a **Query Planner and Visual Architect**, translating human intent into structured parameters (visualization type, axes encodings, grouping fields, and filters).
- **The ClinicalTrials.gov API is the sole source of truth.**
- All counting, mathematical binning, trend calculation, and network construction happen deterministically in **TypeScript service logic**.
- **Every data point carries verifiable proof (Deep Citations)** linking directly to official government trial records.

---

## 2. High-Level Architecture & Lifecycle Diagram

```
                 [ USER REQUEST ]
          (Natural Language + Optional Filters)
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 1. Common / Zod Validation Pipe                         │
│    - Validates query length (5-1000 characters)         │
│    - Type-checks enum filters (PHASE1, RECRUITING, etc) │
└───────────────────────┬─────────────────────────────────┘
                        │ Validated QueryRequestDto
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 2. OpenAI Service (LLM Planner)                         │
│    - Strict Tool-Calling: `plan_visualization`          │
│    - Infers chart type (bar, time_series, network, etc) │
│    - Selects grouping field & channel encodings (x, y)  │
└───────────────────────┬─────────────────────────────────┘
                        │ Structured QueryPlan
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 3. ClinicalTrials.gov API Service                       │
│    - Constructs API v2 search filters (`query.term`)    │
│    - Fetches real studies with automated pagination     │
│    - Extracts NCT IDs, titles, summaries, dates, phases │
└───────────────────────┬─────────────────────────────────┘
                        │ Raw CtStudy[]
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Normalization & Aggregation Engine                   │
│    - Normalizes messy API structures into clean types   │
│    - Deterministic grouping & counting (no LLM math)    │
│    - Time bucketing, network graph link generation      │
└───────────────────────┬─────────────────────────────────┘
                        │ Aggregated DataPoints
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Deep Citations Engine (Bonus)                        │
│    - Extracts relevant text excerpts from API payloads  │
│    - Attaches NCT IDs, titles, and live study URLs      │
│    - Guarantees 100% source traceability per datum      │
└───────────────────────┬─────────────────────────────────┘
                        │ Structured QueryResponse
                        ▼
                 [ FRONTEND / CLIENT ]
   (Renders interactive charts via Chart.js, Vis.js, or custom UI)
```

---

## 3. Step-by-Step Workflow Breakdown

### Step 1: Ingestion & Zod Input Validation
When a client sends a `POST /api/v1/query` request, the payload enters the `ZodValidationPipe`:
- **Input Constraints:** The natural language `query` string must be between 5 and 1000 characters.
- **Structured Fields:** Optional parameters such as `drug_name`, `condition`, `trial_phase`, `sponsor`, `country`, `start_year`, `end_year`, and `status` are validated against strict Zod schemas and enums.
- **Fail-Fast Error Handling:** Any schema violation instantly yields a clean `400 Bad Request` with exact field error messages, preventing malformed inputs from reaching the downstream services.

### Step 2: OpenAI as the Planner (Zero-Hallucination Tool Calling)
The validated request is passed to `OpenAiService.interpretQuery()`.
Instead of generating free-form unstructured text, the model (`gpt-4o-mini`) is bound to an OpenAI **Tool Call** named `plan_visualization` with a strict JSON Schema definition.

The LLM determines:
1. **`visualization_type`:** Selects from `bar_chart`, `grouped_bar_chart`, `time_series`, `scatter_plot`, `histogram`, `network_graph`, `pie_chart`, or `table`.
2. **`title` & `description`:** Generates clean, human-readable titles.
3. **`grouping_field`:** Identifies the primary categorization key (`phase`, `year`, `status`, `sponsor`, etc.).
4. **`aggregation`:** Specifies the reduction operation (`count`, `avg_enrollment`, `sum_enrollment`).
5. **`encoding`:** Defines channel mappings (`x`, `y`, `color`, `series`, `nodes`, `edges`).

Because OpenAI produces a structured function call matching our schema, there is zero chance of prompt leakage or shape deformation.

### Step 3: ClinicalTrials.gov v2 API Querying
The `QueryOrchestrationService` coordinates with `ClinicalTrialsService`:
- It builds target search query terms using the ClinicalTrials.gov query syntax:
  - e.g., `INTERVENTION:"Pembrolizumab"`, `CONDITION:"Alzheimer Disease"`, `AREA[StartDate]RANGE[2010-01-01,MAX]`.
- Requests the `https://clinicaltrials.gov/api/v2/studies` endpoint with requested field projections (`NCTId`, `BriefTitle`, `BriefSummary`, `DesignModule`, `EnrollmentInfo`, `LeadSponsorName`, etc.).
- **Adaptive Fetching:** Adjusts fetch limits based on visualization needs (e.g., 500 studies for rich network graphs; 200 for phase bar charts).
- **Pagination Support:** Automatically consumes `nextPageToken` when necessary.

### Step 4: Normalization & Deterministic Aggregation
Raw records from the API are standardized into clean `NormalizedStudy` TypeScript objects:
- Dates (`2021-04-15`) are parsed into numeric years (`2021`).
- Missing enrollment numbers are handled gracefully without corrupting calculations.
- Phases (`["PHASE1", "PHASE2"]`) are flattened or assigned to dominant buckets.
- The `VisualizationService` deterministically aggregates studies into data points:
  - Grouping studies by the planned category.
  - Computing trial counts, enrollment sums, and averages.
  - Constructing nodes and edge weights for network relationships.

### Step 5: Bonus — Deep Citation Generation & Source Traceability
To ensure maximum academic and clinical rigor, each aggregated data point includes deep citations:
- Every bar, timeline point, or network edge includes an array of contributing `citations`.
- Each citation contains:
  1. `nct_id`: Unique trial identifier (e.g., `NCT02437136`).
  2. `study_title`: The official brief title of the study.
  3. `excerpt`: An authentic excerpt from the study's `briefSummary` describing the intervention and rationale.
  4. `url`: Direct link to the live government trial record (`https://clinicaltrials.gov/study/NCT...`).

### Step 6: Frontend Specification & Rendering
The service returns a unified `QueryResponse` JSON object:
- **`visualization`:** Contains the chart type, title, encoding mappings, and the array of data points.
- **`meta`:** Contains query interpretation, total studies fetched, filters applied, execution time in milliseconds, and data source credits.

A frontend application (or the built-in UI at `http://localhost:3000/`) can inspect `visualization.type` and immediately render the appropriate view without custom backend logic.

---

## 4. Concrete Walkthrough Example: Pembrolizumab Query

### 1. User Input
```json
{
  "query": "Show me the distribution of clinical trials by phase for Pembrolizumab",
  "drug_name": "Pembrolizumab"
}
```

### 2. LLM Planning Output
```json
{
  "visualization_type": "bar_chart",
  "title": "Distribution of Clinical Trials by Phase for Pembrolizumab",
  "grouping_field": "phase",
  "aggregation": "count",
  "x_label": "Phase",
  "y_label": "Trial Count"
}
```

### 3. API Query to ClinicalTrials.gov
- **Endpoint:** `GET https://clinicaltrials.gov/api/v2/studies`
- **Params:** `query.term=INTERVENTION:"Pembrolizumab"&pageSize=200&format=json`
- **Result:** 200 real studies returned from the database.

### 4. Aggregation & Citation Output
```json
{
  "phase": "PHASE2",
  "trial_count": 87,
  "citations": [
    {
      "nct_id": "NCT02437136",
      "study_title": "Ph1b/2 Dose-Escalation Study of Entinostat With Pembrolizumab...",
      "excerpt": "The purpose of this study is to determine the safety and tolerability of entinostat used in combination with pembrolizumab...",
      "url": "https://clinicaltrials.gov/study/NCT02437136"
    }
  ]
}
```

### 5. Final Client Spec
The frontend draws a bar chart with 4 bars (`PHASE1: 57`, `PHASE2: 87`, `PHASE3: 33`, `PHASE4: 2`). Clicking on any bar reveals the citations drawer with links to ClinicalTrials.gov.

---

## 5. Visualization Type Decision Matrix

| Question Intent | Chosen Type | Visual Channels | Aggregation Strategy |
|---|---|---|---|
| Phase or category distribution | `bar_chart` | X: Category, Y: Count | Frequency grouping |
| Growth, trajectory over years | `time_series` | X: Year, Y: Trials / Enrollment | Yearly bucket accumulation |
| Relationships, collaborations | `network_graph` | Nodes: Sponsor/Condition, Edges: Shared studies | Co-occurrence matrix with weight filtering |
| Cross-category comparisons | `grouped_bar_chart` | X: Primary, Series: Secondary, Y: Count | 2D grouping matrix |
| Correlation (e.g. Duration vs Size) | `scatter_plot` | X: Year / Duration, Y: Enrollment | Raw normalized coordinate mapping |
| Distribution of study sizes | `histogram` | X: Range Bins (0–99, 100–499), Y: Count | Geometric bin partitioning |

---

*Authored for the ClinicalTrials.gov Query-to-Visualization Agent repository.*
