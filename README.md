# Potential Medical AI

Evidence-aware healthcare assistant with a **separate medical knowledge control plane**, server-side model gateway, deterministic emergency guardrails, source freshness policies, versioned evidence, and an MCP interface.

> This project provides general educational information. It is not a diagnostic, prescribing, emergency-response, or clinical decision system.

## Architecture

```text
Official APIs / feeds
        │
        ▼
Knowledge Control Plane :8790
  - scheduled connectors
  - versioning and provenance
  - freshness SLOs
  - clinical review queue
  - REST API
  - MCP tools/resources
        │
        ▼
Medical Chat Gateway :8787
  - emergency safety gate
  - knowledge retrieval
  - evidence-grounded model prompt
  - citations
        │
        ▼
React frontend :3000
  - presentation and chat history only
  - no model keys
  - no local RAG, symptom analysis, or clinical fallback
```

MCP is the standardized access layer for agents. It does **not** make sources current by itself. Freshness comes from official APIs/feeds, scheduled synchronization, source timestamps, version hashes, and a fail-closed policy.

## Freshness policy

- PubMed, ClinicalTrials.gov, openFDA, CDC, DailyMed, WHO ICD-11, and configured official guideline feeds are synchronized by the knowledge plane.
- Each source has a maximum-age SLO.
- Required stale or never-synchronized sources make the knowledge plane unusable when `KNOWLEDGE_FAIL_CLOSED=true`.
- High-risk changes involving dose, contraindications, pregnancy, renal/hepatic impairment, emergencies, warnings, or mortality are excluded from normal retrieval until clinical review.
- Research papers, trial registrations, and adverse-event reports remain evidence candidates; they are not automatically promoted into treatment recommendations.

No system can guarantee that every source is error-free or instantaneously current. This platform instead makes staleness visible and blocks medical answers when required freshness cannot be proven.

## Product roadmap

The roadmap replaces the original “To-do in the upcoming” list. Features are ordered by patient-safety value rather than visual novelty.

### P0 — Clinical governance and reliability

- [ ] **Clinical review console** — side-by-side source diff, reviewer identity, dual approval for high-risk changes, rejection reasons, rollback, and immutable audit history.
- [ ] **Medical evaluation gate in CI** — clinician-reviewed Vietnamese and English cases covering emergencies, contraindications, pregnancy, renal/hepatic impairment, hallucinations, missing citations, and prompt injection. Releases fail when safety or grounding scores regress.
- [ ] **Freshness and connector observability** — dashboards and alerts for stale required sources, sync failures, review-queue age, citation coverage, model latency, and error rate.
- [ ] **Source and jurisdiction registry** — license terms, authority level, country applicability, effective date, superseded guidance, and permitted reuse for every source.
- [ ] **Privacy control plane** — explicit consent, encrypted storage, configurable retention, export/delete workflows, secret rotation, access logs, and separation of health data from product analytics.

### P1 — Safer clinical collaboration

- [ ] **Secure clinician sharing** — expiring and revocable signed links, scoped transcript access, patient consent, optional redaction, access audit, and no raw chat IDs in public URLs.
- [ ] **Structured patient context** — age range, medications, allergies, diagnoses, pregnancy status, kidney/liver considerations, and user-confirmed corrections. Context must never silently become a diagnosis.
- [ ] **Longitudinal health timeline** — user-controlled summaries of symptoms, medications, measurements, and source-backed changes across conversations.
- [ ] **Clinician export** — printable evidence summary and optional FHIR-compatible export after terminology and privacy validation.

### P1 — Multimodal evidence ingestion

- [ ] **Secure document and image upload** — isolated object storage, file-type validation, malware scanning, size limits, retention controls, and de-identification before analysis.
- [ ] **Evidence-preserving extraction** — PDF/image text extraction with page-level citations, confidence indicators, and a clear distinction between source text and model interpretation.
- [ ] **Laboratory-result explanation** — unit-aware reference ranges, age/sex/context caveats, abnormal-value highlighting, and explicit prohibition on standalone diagnosis.
- [ ] **Medical image boundary** — educational description only unless a separately validated regulated imaging workflow is introduced.

### P1 — Multilingual and terminology quality

- [ ] **Vietnamese-first terminology layer** — ICD-11/SNOMED mappings, aliases, abbreviations, accent-insensitive matching, and preservation of medication names, units, and doses.
- [ ] **Locale-aware evidence routing** — prioritize applicable Vietnam Ministry of Health guidance while showing international sources and jurisdiction conflicts explicitly.
- [ ] **Translation quality evaluation** — regression tests for negation, emergency language, dosage expressions, pregnancy terms, and ambiguous symptom descriptions.

### P2 — Platform and agent capabilities

- [ ] **Authenticated remote MCP** — Streamable HTTP transport, OAuth/service identity, private networking, host validation, per-tool authorization, rate limits, and read-only defaults.
- [ ] **Model routing and fallback policy** — choose models by task, evidence sensitivity, latency, cost, and measured evaluation quality; never fall back to an ungrounded medical answer.
- [ ] **Evidence conflict resolver** — surface disagreements between current guidelines, labels, jurisdictions, and newer research instead of blending them into one unsupported recommendation.
- [ ] **Cost and capacity controls** — response budgets, caching of immutable evidence, queueing, provider circuit breakers, and per-tenant quotas.
- [ ] **Public status and incident workflow** — knowledge freshness status, provider outages, incident notes, and safe degraded-mode messaging.

### Completed or superseded from the original list

- [x] **Move AI keys and prompts out of the client bundle** — completed with the server-side gateway and browser-boundary CI guard.
- [x] **Separate backend middleware and knowledge processing** — completed with the chat gateway and private knowledge control plane.
- [x] **Realtime streaming responses** — retained through the gateway stream endpoint.
- [~] **Chat URL sharing** — superseded by secure, expiring clinician-sharing links; raw unique IDs are intentionally rejected.
- [~] **“Deep thinking” for uploads** — replaced by evidence-preserving multimodal ingestion, citations, extraction confidence, and safety boundaries.
- [~] **Multilanguage responses** — basic English/Vietnamese support exists; terminology mapping and formal quality evaluation remain planned.

### Explicit non-goals

- No autonomous diagnosis or prescribing.
- No automatic promotion of a new paper, trial, adverse-event report, or model output into treatment guidance.
- No public access to the knowledge control plane.
- No browser-side medical fallback when the gateway or required evidence sources are unavailable.
- No patient or clinician sharing through guessable identifiers.

## Local development

```bash
cp env.example .env
npm install
npm run dev
```

`npm run dev` starts the knowledge plane, chat gateway, and Vite frontend. Individual services can also be started separately:

```bash
npm run start:knowledge
npm run start:gateway
npm run dev:web
```

## Production

Build the frontend, then run the two backend processes as separate services:

```bash
npm install
npm run build
npm run start:knowledge
npm run start:gateway
```

The gateway can serve the built React application from `dist/`. In production, place the knowledge plane on a private network and expose only the gateway publicly.

## MCP knowledge server

Run the read-only stdio MCP server:

```bash
npm run mcp:knowledge
```

It exposes:

- `search_medical_knowledge`
- `get_medical_knowledge_status`
- `sync_medical_sources` — disabled unless `MCP_ALLOW_SYNC=true`
- `medical://knowledge/status`
- `medical://disease/{diseaseId}`
- `ground_medical_answer` prompt template

The MCP server reads from the same versioned knowledge store as the REST control plane. Sync remains operator-controlled and read-only by default.

## Synchronization

```bash
npm run sync:knowledge
npm run sync:knowledge -- pubmed clinicaltrials.gov
```

Protected knowledge-plane trigger:

```bash
curl -X POST http://localhost:8790/sync \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sources":["pubmed","clinicaltrials.gov"]}'
```

## Endpoints

### Knowledge control plane — private

- `GET /health`
- `GET /status`
- `GET /search?q=...&limit=...`
- `GET /diseases`
- `GET /diseases/:id`
- `POST /sync` — administrator token required

### Chat gateway — public

- `GET /api/health`
- `GET /api/knowledge/status`
- `GET /api/knowledge/search?q=...&limit=...`
- `GET /api/knowledge/diseases`
- `POST /api/chat/stream`

Direct model endpoints and browser-side clinical orchestration are intentionally not exposed.

## Validation

```bash
npm test
npm run build
npm run check
```

## Clinical governance before real patient use

A real-patient deployment still requires clinician-reviewed evaluation datasets, source-license validation, reviewer identities and approvals, encrypted patient-data controls, consent and retention policies, immutable audit logs, rollback, penetration testing, and applicable legal/regulatory review.

See [docs/KNOWLEDGE_CONTROL_PLANE.md](docs/KNOWLEDGE_CONTROL_PLANE.md) and [docs/MEDICAL_KNOWLEDGE_PLATFORM.md](docs/MEDICAL_KNOWLEDGE_PLATFORM.md).
