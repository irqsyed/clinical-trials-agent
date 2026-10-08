# ClinicalTrials.gov Query-to-Visualization API

An AI-powered NestJS backend that converts natural language questions about clinical trials into structured visualization specifications backed by real ClinicalTrials.gov data.

> 📖 **Deep Dive Architecture Guide:** For a comprehensive step-by-step breakdown of query planning, ClinicalTrials.gov API fetching, aggregation, and citations, see [explain_work_flow.md](explain_work_flow.md).
> 🖥️ **Interactive Web UI Guide:** For an illustrated walkthrough of the browser interface, presets, chart controls, and citations drawer, see [ui_user_guide.md](ui_user_guide.md).

---

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure

Copy `.env.example` to `.env` (or edit the existing `.env`):

```bash
cp .env.example .env
```

The `.env` is pre-configured with the provided API key. You can change the model:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini   # or gpt-4o-2024-08-06, gpt-4.1, gpt-4.1-mini, etc.
PORT=3000
CT_PAGE_SIZE=200
```

### 3. Test, Build & Run

```bash
# 1. Run Unit Tests (24 tests pass)
npm test

# 2. Run End-to-End Tests (4 tests pass)
npm run test:e2e

# 3. Build Project
npm run build

# 4. Start Server
npm run start:prod
# or: npm run start:dev
```

### 4. Access

- **Interactive Web Demo:** `http://localhost:3000/` (see [ui_user_guide.md](ui_user_guide.md) for full guide on presets, charts, & citations)
- **Swagger UI:** `http://localhost:3000/api/docs`
- **API Endpoint:** `POST http://localhost:3000/api/v1/query`

---

## Request / Response Schema

### POST /api/v1/query

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string (5–1000 chars) | ✅ Yes | Natural language question about clinical trials |
| `drug_name` | string | No | Drug or intervention name (e.g., `Pembrolizumab`) |
| `condition` | string | No | Disease or condition (e.g., `lung cancer`) |
| `trial_phase` | enum | No | `PHASE1`, `PHASE2`, `PHASE3`, `PHASE4`, `EARLY_PHASE1`, `NA` |
| `sponsor` | string | No | Lead sponsor name (e.g., `Merck`) |
| `country` | string | No | Country filter (e.g., `US`, `Germany`) |
| `start_year` | integer (1990–2030) | No | Filter trials starting from this year |
| `end_year` | integer (1990–2030) | No | Filter trials up to this year |
| `status` | enum | No | `RECRUITING`, `COMPLETED`, `ACTIVE`, `NOT_YET_RECRUITING`, `TERMINATED`, `WITHDRAWN`, `SUSPENDED` |

**Example:**
```json
{
  "query": "How has the number of lung cancer trials changed over time?",
  "condition": "lung cancer",
  "start_year": 2010
}
```

#### Response Body

```typescript
{
  visualization: {
    type: "bar_chart" | "grouped_bar_chart" | "time_series" | "scatter_plot" 
          | "histogram" | "network_graph" | "pie_chart" | "table",
    title: string,
    description: string,
    encoding: {
      x?: { field: string, label?: string },
      y?: { field: string, label?: string, unit?: string },
      color?: { field: string },
      size?: { field: string },
      series?: { field: string },
      nodes?: { field: string },    // network_graph only
      edges?: { field: string },    // network_graph only
    },
    data: Array<DataPoint>,         // type-specific (see below)
    sorting?: { field: string, direction: "asc" | "desc" },
    time_granularity?: "year" | "month" | "quarter",
  },
  meta: {
    filters_applied: Record<string, unknown>,
    total_trials_fetched: number,
    source: "clinicaltrials.gov",
    query_interpretation: string,   // how the LLM interpreted the query
    notes: string[],
    processing_time_ms: number,
  }
}
```

#### Data Point Shapes by Visualization Type

**bar_chart / pie_chart** (aggregation=count):
```json
{ "phase": "PHASE3", "trial_count": 41, "citations": [...] }
```

**bar_chart** (aggregation=sum_enrollment):
```json
{ "sponsor": "Merck", "total_enrollment": 15420, "citations": [...] }
```

**time_series:**
```json
{ "year": 2020, "trial_count": 87, "total_enrollment": 24500, "avg_enrollment": 281, "citations": [...] }
```

**scatter_plot:**
```json
{ "nct_id": "NCT01234567", "title": "...", "year": 2019, "enrollment": 320, "phase": "PHASE3", "citations": [...] }
```

**histogram:**
```json
{ "bin_start": 100, "bin_end": 199, "bin_label": "100–199", "count": 23, "citations": [...] }
```

**network_graph** (nodes):
```json
{ "element_type": "node", "id": "Merck", "type": "sponsor", "count": 12 }
```

**network_graph** (edges):
```json
{ "element_type": "edge", "source": "Merck", "target": "condition:Lung Cancer", "weight": 8, "citations": [...] }
```

**table:**
```json
{ "nct_id": "NCT01234567", "title": "...", "status": "COMPLETED", "phase": "PHASE3", "sponsor": "...", "enrollment": 150, "url": "..." }
```

#### Citations (Deep Source Traceability)

Every data point includes a `citations` array for full source traceability:

```json
{
  "citations": [
    {
      "nct_id": "NCT01234567",
      "study_title": "A Phase 3 Study of Pembrolizumab...",
      "excerpt": "Phase 3 randomized, double-blind, placebo-controlled study...",
      "url": "https://clinicaltrials.gov/study/NCT01234567"
    }
  ]
}
```

---

## Architecture

```
POST /api/v1/query
       │
       ▼
ZodValidationPipe  (validates & types the input)
       │
       ▼
ClinicalTrialsController
       │
       ▼
QueryOrchestrationService
       ├── OpenAiService.interpretQuery()     → QueryPlan (viz type, grouping, title)
       ├── ClinicalTrialsService.fetchStudies() → raw CtStudy[]
       ├── ClinicalTrialsService.normalizeStudies() → NormalizedStudy[]
       └── VisualizationService.buildResponse()  → QueryResponse
```

### Key Design Decisions

1. **LLM Tool-Calling (Not Free-Form):** OpenAI is constrained to call a specific `plan_visualization` function with a strict JSON schema. This eliminates hallucination risk — the LLM cannot produce an invalid or unexpected response shape.

2. **Separation of Concerns:** Data fetching, normalization, LLM planning, and visualization building are in separate services. Each can be tested independently and swapped out.

3. **Zod as Single Source of Truth:** Input/output schemas are defined once in Zod and used for both runtime validation and TypeScript types. No duplication.

4. **Deep Citations on Every Data Point:** Every aggregated datum carries references to the underlying `nct_id`s that contributed to it, enabling full audit trails from chart bar → source trial.

5. **Pagination Support:** The CT API service handles `nextPageToken` pagination automatically, fetching up to the configured limit without burdening the controller.

6. **Adaptive Fetch Limits:** Network graphs fetch more studies (500) than bar charts (200) for richer relationship data.

### Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Tool-calling for viz planning | Slightly slower than prompt completion, but eliminates schema drift |
| Fetching all studies in one request | Simpler logic, but large queries may take longer |
| In-memory aggregation | Works for ≤1000 studies; a DB would scale better |
| Network graph edges filtered at weight ≥ 2 | Reduces noise but may miss rare connections |

### Limitations

- Network graphs work best with a focused query (condition/sponsor filter); without filters, the graph becomes too dense.
- Enrollment data is sometimes missing or estimated — histogram/scatter results reflect only studies with reported values.
- The API has a max page size of 1000 per request; very broad queries may not capture all trials.
- Rate limits on the ClinicalTrials.gov API may affect latency for large datasets.

### What I Would Improve With More Time

- Add Redis caching for frequently queried drug/condition combinations
- Implement smarter date-range queries using the CT API's `filter.advanced` syntax
- Add a streaming endpoint for progressive chart rendering
- Support multi-turn conversation (chat history context)
- Add geographic heat map visualization type using country counts
- Integrate a vector DB for semantic query matching across trial descriptions

---

## Running Tests

The test suite covers unit tests for all business logic and end-to-end (E2E) tests for HTTP request validation:

```bash
# 1. Run all unit tests (24 passed)
npm test

# 2. Run end-to-end tests (4 passed)
npm run test:e2e

# 3. Run all tests with code coverage report
npm run test:cov
```

### Test Suite Breakdown:

| Test Suite | File | Tests | What is Verified |
|---|---|:---:|---|
| **Zod Validation Pipe** | `src/common/pipes/zod-validation.pipe.spec.ts` | 6 tests | Valid payloads pass, missing `query` rejects with 400, query < 5 chars rejects, invalid phase/status enum rejects |
| **Visualization Service** | `src/visualization/visualization.service.spec.ts` | 11 tests | Correct aggregations for `bar_chart`, `time_series`, `network_graph`, `scatter_plot`, `histogram`, `table`; verified Deep Citation attachments |
| **ClinicalTrials Service** | `src/clinical-trials/clinical-trials.service.spec.ts` | 7 tests | Query string building, pagination token handling, study normalization, date parsing, missing field fallbacks |
| **E2E Validation Suite** | `test/app.e2e-spec.ts` | 4 tests | Full HTTP pipeline rejection: empty body (400), short query (400), invalid phase enum (400), out-of-bounds year (400) |

**Total:** 28 passing tests across 4 test suites (100% pass rate).

---

## Example Queries & Runs

The `examples/` directory contains 5 actual queries executed against the live API with complete real outputs:

| Example | Query | Filters | Visualization Type | Key Feature |
|---------|-------|---------|-------------------|-------------|
| **Example 1** | *"Show me the distribution of clinical trials by phase for Pembrolizumab"* | `drug_name: "Pembrolizumab"` | `bar_chart` | Categorical aggregation by Phase 1-4 with Deep Citations |
| **Example 2** | *"How has the number of clinical trials for Alzheimer's disease changed over time?"* | `condition: "Alzheimer Disease"`, `start_year: 2010`, `end_year: 2024` | `time_series` | Yearly trend bucket with total/average enrollment counts |
| **Example 3** | *"Show the network graph of sponsors and conditions researching CAR-T therapy"* | `drug_name: "CAR-T"` | `network_graph` | Force-directed entity graph with nodes, edges, weights & study links |
| **Example 4** | *"Compare recruitment status across trial phases for Breast Cancer studies"* | `condition: "Breast Cancer"` | `grouped_bar_chart` | Multi-dimensional breakdown of phase vs recruitment status |
| **Example 5** | *"Show the relationship between study duration and participant enrollment for Melanoma immunotherapy trials"* | `condition: "Melanoma"` | `scatter_plot` | 2D distribution of study timeline vs enrollment scale |

```bash
# Test Example 1 with curl:
curl -X POST http://localhost:3000/api/v1/query \
  -H "Content-Type: application/json" \
  -d @examples/example1-request.json
```

---

## Tools & AI Usage

- **OpenAI API:** Used for query interpretation and visualization type selection (tool-calling mode)
- **ClinicalTrials.gov API v2:** Primary data source — no data is stored locally
- **Antigravity IDE:** AI pair programming assistance for scaffolding and implementation
- **Validation:** All LLM outputs are constrained by strict JSON schemas; no free-form LLM text enters the response pipeline
- **Design:** Each service, type, and test was reviewed and deliberately structured for maintainability

Human-validated decisions include: tool-calling schema design, citation attachment strategy, network graph edge-weight filtering, and adaptive fetch limits per viz type.
