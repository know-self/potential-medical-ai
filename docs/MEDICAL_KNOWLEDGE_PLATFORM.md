# Medical Knowledge Platform

## Objective

This repository uses a near-realtime, versioned medical knowledge layer instead of treating model memory as the source of truth. External material is retrieved, normalized, classified, versioned, and returned with provenance. High-risk changes remain review candidates.

## Runtime architecture

```text
React client
  ├─ local emergency safety detector
  ├─ evidence-aware orchestrator
  └─ model and knowledge requests through /api
        │
        ▼
Node Medical API
  ├─ rate limiting and CORS
  ├─ OpenRouter and Google model gateway
  ├─ disease/comorbidity catalog
  ├─ versioned knowledge store
  ├─ relevance search with source metadata
  ├─ manual sync endpoint protected by API_ADMIN_TOKEN
  └─ scheduled source connectors
        ├─ PubMed E-utilities
        ├─ ClinicalTrials.gov API v2
        ├─ openFDA drug enforcement
        ├─ CDC Content Services API v2
        ├─ DailyMed SPL v2 by configured SET IDs
        ├─ WHO ICD-11 API v2 when credentials exist
        └─ configurable official WHO/NICE/Vietnam MOH feeds
```

## Realtime semantics

“Realtime” means the answer uses the newest successfully synchronized and review-qualified version in the local store. It does not mean that every external document is instantly converted into treatment advice.

- Research and trial registrations are stored as evidence candidates.
- Official labels, safety alerts, and guidelines have higher evidence priority.
- Dose, contraindication, pregnancy, organ impairment, emergency, and mortality changes receive `high-risk-clinical-change` classification.
- A human clinical review workflow is still required before production use for individualized treatment decisions.

## Local development

```bash
cp env.example .env
npm install

# Terminal 1: medical API and model gateway
npm run server

# Terminal 2: existing local chat-history JSON server
npm run server:chat

# Terminal 3: React application
npm run dev
```

The Vite development server proxies `/api` to `http://localhost:8787`. In deployed environments, set `VITE_MEDICAL_API_URL` to the public Medical API origin.

## Synchronization

Run all enabled connectors:

```bash
npm run sync:knowledge
```

Trigger selected sources through the protected endpoint:

```bash
curl -X POST http://localhost:8787/api/knowledge/sync \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sources":["pubmed","clinicaltrials.gov"]}'
```

Persistent runtime data is written under `server/data/` and excluded from Git.

## API summary

- `GET /api/health`
- `GET /api/knowledge/status`
- `GET /api/knowledge/search?q=...&limit=...`
- `GET /api/knowledge/diseases`
- `GET /api/knowledge/diseases/:id`
- `POST /api/safety/assess`
- `POST /api/models/openrouter/stream`
- `POST /api/models/google/generate`
- `POST /api/knowledge/sync` — administrator token required

## Clinical governance required before production

1. Replace JSON persistence with PostgreSQL/object storage and immutable source snapshots.
2. Add reviewer identities, approval signatures, four-eyes review for high-risk changes, and rollback.
3. Validate every source license and configure only official feed URLs.
4. Add clinician-authored evaluation sets for emergencies, drug interactions, pregnancy, pediatrics, kidney/liver impairment, and multilingual queries.
5. Add authentication, encrypted patient data storage, consent, retention, export/deletion, and audit controls.
6. Do not advertise the service as a diagnostic or prescribing system without legal, regulatory, security, and clinical validation.
