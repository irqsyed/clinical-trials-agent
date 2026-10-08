# Interactive Web UI Guide: ClinicalTrials.gov Query-to-Visualization Agent

This guide explains how to use the built-in, browser-based user interface for the **ClinicalTrials.gov Query-to-Visualization Agent**, detailing all controls, presets, charts, visual encodings, and inspection tools.

---

## Table of Contents
1. [Accessing the User Interface](#1-accessing-the-user-interface)
2. [Layout & Component Overview](#2-layout--component-overview)
3. [Quick Example Runs (Preset Options Explained)](#3-quick-example-runs-preset-options-explained)
4. [Custom Query & Filter Controls](#4-custom-query--filter-controls)
5. [Pipeline Metrics Bar](#5-pipeline-metrics-bar)
6. [Interactive Visualization Tabs](#6-interactive-visualization-tabs)
   - [Tab 1: Interactive Visualization](#tab-1-interactive-visualization)
   - [Tab 2: Deep Citations (Bonus Source Traceability)](#tab-2-deep-citations-bonus-source-traceability)
   - [Tab 3: AI Query Reasoning](#tab-3-ai-query-reasoning)
   - [Tab 4: Response JSON Spec Inspector](#tab-4-response-json-spec-inspector)
7. [Supported Chart Types & Interpretation](#7-supported-chart-types--interpretation)

---

## 1. Accessing the User Interface

The web interface is hosted directly by the NestJS backend and requires no build step or separate frontend server.

1. Ensure your server is running:
   ```bash
   npm run start:prod
   # or: npm run start:dev
   ```
2. Open your web browser and navigate to:
   👉 **`http://localhost:3000/`**

*(Note: The full OpenAPI/Swagger documentation is also accessible anytime via the top header link or directly at `http://localhost:3000/api/docs`).*

---

## 2. Layout & Component Overview

The interface features a responsive dark-mode theme designed with frosted glassmorphism cards, glowing accent colors, and clear visual hierarchy:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 🧬 ClinicalTrials.gov Query-to-Visualization     [Live Agent] [Swagger]│
├────────────────────────────────────────────────────────────────────────┤
│ ⚡ Quick Example Runs (Presets):                                       │
│ [💊 Pembrolizumab] [📈 Alzheimer's] [🕸️ CAR-T] [📊 Breast] [🔬 Melanoma]│
├────────────────────────────────────────────────────────────────────────┤
│ [ Natural Language Search Input Bar                       ] [✨ Run]   │
│ ⚙️ Show Optional Filters (Drug, Phase, Condition, Sponsor, Years...)   │
├────────────────────────────────────────────────────────────────────────┤
│ 📊 Pipeline Status: Viz Type | Trials Fetched | Execution Time | LLM  │
├────────────────────────────────────────────────────────────────────────┤
│ [📊 Visualization] [🔍 Deep Citations] [🧠 Reasoning] [📄 JSON Spec]   │
│                                                                        │
│                    (Interactive Chart / Graph Display)                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Quick Example Runs (Preset Options Explained)

Across the top of the search card, you will find five 1-click preset buttons. Each button tests a distinct scientific question, invokes the live ClinicalTrials.gov API, and produces a unique chart type:

### Option 1: 💊 Pembrolizumab Phase Distribution
* **What it selects:**
  - Query: `"Show me the distribution of clinical trials by phase for Pembrolizumab"`
  - Filter: `drug_name: "Pembrolizumab"`
* **What it plots:** A **Categorical Bar Chart**.
* **What it tells you:** 
  - Shows how many clinical studies for Merck's immunotherapy drug Pembrolizumab (Keytruda) are currently registered in each clinical phase (`PHASE1`, `PHASE2`, `PHASE3`, `PHASE4`).
  - Highlights that Phase 2 dominates the pipeline, reflecting extensive combination studies in oncology.

---

### Option 2: 📈 Alzheimer's Disease Over Time
* **What it selects:**
  - Query: `"How has the number of clinical trials for Alzheimer's disease changed over time?"`
  - Filters: `condition: "Alzheimer Disease"`, `start_year: 2010`, `end_year: 2024`.
* **What it plots:** A **Time Series Smooth Line Chart** with an illuminated area fill.
* **What it tells you:**
  - The annual trajectory and growth rate of Alzheimer's clinical trial launches over a 15-year window.
  - Hovering on any data point reveals the exact study count and average participant enrollment for that year.

---

### Option 3: 🕸️ CAR-T Sponsor & Condition Network
* **What it selects:**
  - Query: `"Show the network graph of sponsors and conditions researching CAR-T therapy"`
  - Filter: `drug_name: "CAR-T"`
* **What it plots:** An **Interactive Force-Directed Network Graph** (powered by physics simulation).
* **What it tells you:**
  - **Purple Circles (Dot nodes):** Academic medical centers, universities, and pharmaceutical sponsors researching CAR-T.
  - **Cyan Diamonds:** Disease conditions targeted (e.g. *Multiple Myeloma*, *Acute Lymphoblastic Leukemia*, *B-Cell Lymphoma*).
  - **Connecting Edges:** Thicker lines signify stronger collaborative cross-links or shared clinical trials between that sponsor and condition.
  - *Interaction:* You can click, drag nodes to untangle clusters, and scroll to zoom in/out.

---

### Option 4: 📊 Breast Cancer Phase vs Recruitment
* **What it selects:**
  - Query: `"Compare recruitment status across trial phases for Breast Cancer studies"`
  - Filter: `condition: "Breast Cancer"`
* **What it plots:** A **Multi-Dimensional Grouped Bar Chart**.
* **What it tells you:**
  - Compares trial counts across multiple categories simultaneously.
  - Groups the data by clinical phase on the X-axis while color-coding recruitment statuses or start years to show where active patient accrual is concentrated.

---

### Option 5: 🔬 Melanoma Immunotherapy Enrollment
* **What it selects:**
  - Query: `"Show the relationship between study duration and participant enrollment for Melanoma immunotherapy trials"`
  - Filter: `condition: "Melanoma"`
* **What it plots:** A **2D Scatter Plot**.
* **What it tells you:**
  - Plots individual clinical trials along two quantitative axes: study start timeline (X-axis) versus total participant enrollment size (Y-axis).
  - Helps identify outlier mega-trials (thousands of patients) versus targeted early-phase biomarker studies.

---

## 4. Custom Query & Filter Controls

You can type any natural language question or combine it with targeted metadata filters:

1. **Natural Language Input Bar:**
   - Type any clinical question (e.g., *"How many Phase 3 diabetes trials are recruiting in the US?"*).
   - Press Enter or click **"✨ Run Agent"**.

2. **Expandable "Show Optional Filters" Drawer:**
   Clicking the **⚙️ Show Optional Filters** button toggles a granular filtering drawer:
   - **Drug Name:** Target specific interventions (e.g. *Metformin*, *Nivolumab*, *Aspirin*).
   - **Condition:** Narrow down the disease area (e.g. *Pancreatic Cancer*, *Hypertension*).
   - **Phase:** Dropdown to lock to a specific phase (`Phase 1`, `Phase 2`, `Phase 3`, `Phase 4`, or `Early Phase 1`).
   - **Sponsor:** Filter by lead organization (e.g. *Pfizer*, *National Cancer Institute*, *Novartis*).
   - **Start Year / End Year:** Set calendar bounds for study initiation dates.

---

## 5. Pipeline Metrics Bar

Once an analysis completes, a real-time status bar appears with key system telemetry:
- **Visualization Badge:** Indicates the chart type chosen by the LLM planner (e.g. `BAR CHART`, `NETWORK GRAPH`, `TIME SERIES`).
- **Trials Analyzed:** Total count of authentic trial records fetched from ClinicalTrials.gov (e.g., `200` or `480`).
- **Time (ms):** Total round-trip latency including LLM interpretation, government API fetch, and aggregation.
- **Source:** Authoritative confirmation (`clinicaltrials.gov API v2`).
- **LLM Engine:** Confirms OpenAI `GPT-4o-mini` with strict tool calling.

---

## 6. Interactive Visualization Tabs

Under the metrics bar, four dedicated tabs allow you to explore the data from different perspectives:

### Tab 1: 📊 Interactive Visualization
- Renders the primary graphic according to the structured specification.
- For charts (bar, line, scatter): Includes interactive tooltips on hover, responsive auto-scaling, and clean axes labels.
- For network graphs: Provides interactive physics with drag-and-drop nodes and smooth edge bundling.

### Tab 2: 🔍 Deep Citations (Bonus Source Traceability)
- Shows a searchable grid of **verifiable evidence cards**.
- Each card represents an actual ClinicalTrials.gov record contributing to the visual data:
  - **🔗 NCT ID Badge:** Clickable link that opens the official trial page directly (e.g. `https://clinicaltrials.gov/study/NCT02437136`).
  - **Study Title:** Full official study title.
  - **Authentic Excerpt:** Exact text excerpt pulled directly from the trial's brief summary proving the phase, intervention, or criteria.

### Tab 3: 🧠 Query Reasoning
- **Agent Query Interpretation:** Explains in plain English how the AI understood the user's intent.
- **Applied Filters JSON:** Shows the exact dictionary of filters passed to the ClinicalTrials.gov API query engine.

### Tab 4: 📄 Response JSON Spec Inspector
- Displays the complete, raw JSON response returned by `POST /api/v1/query`.
- Demonstrates full adherence to the required specification schema (`visualization` + `meta`).
- Includes a **📋 Copy JSON** button so frontend engineers can copy the payload and test custom renderers.

---

## 7. Supported Chart Types & Interpretation

| Visualization Type | Icon | How to Read It | Best Suited For |
|---|:---:|---|---|
| **`bar_chart`** | 📊 | Heights of bars represent trial frequency or total enrolled patients per category. | Phase breakdown, sponsor rankings, status distributions. |
| **`time_series`** | 📈 | Trend line across chronological years. Upward slopes indicate growing research interest. | Historical trial launches, yearly enrollment trends. |
| **`network_graph`** | 🕸️ | Nodes are entities (sponsors/conditions); links show shared clinical trials. | Discovering research collaborations and cross-disease targets. |
| **`grouped_bar_chart`**| 📶 | Clustered bars comparing primary categories subdivided by a secondary attribute. | Comparing recruitment status across different phases. |
| **`scatter_plot`** | 🔬 | Discrete points showing relationship between two numeric variables (e.g. Year vs Enrollment). | Correlating study duration, year, and cohort size. |

---

*Authored for the ClinicalTrials.gov Query-to-Visualization Agent repository.*
