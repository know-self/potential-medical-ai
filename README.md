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
