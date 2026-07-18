# Potential Medical AI

Evidence-aware healthcare assistant with emergency guardrails, server-side model credentials, a versioned medical knowledge store, multidisciplinary disease profiles, citations, and scheduled official-source synchronization.

> This project provides general educational information. It is not a diagnostic, prescribing, emergency-response, or clinical decision system.

## What changed in v2

- Model API keys moved from the React bundle to a backend gateway.
- Deterministic emergency and crisis detection runs before model calls.
- A versioned knowledge layer records source, jurisdiction, publication/update dates, evidence tier, review status, and previous versions.
- 40+ structured disease and comorbidity profiles cover cardiovascular, endocrine, kidney, respiratory, infectious, liver, gastrointestinal, neurologic, mental-health, autoimmune, oncology, hematology, obstetric, metabolic, and dermatology domains.
- Near-realtime connectors support PubMed, ClinicalTrials.gov, openFDA recalls, CDC content, DailyMed labels, WHO ICD-11, and configurable official WHO/NICE/Vietnam Ministry of Health feeds.
- High-risk changes involving dose, contraindications, pregnancy, kidney/liver impairment, emergencies, warnings, or mortality are routed to clinical review.
- RAG results are supplied to both models and returned with evidence citations.
- Local symptom analytics no longer sends conversation data to a separate model.
- Node tests and GitHub Actions validate the safety, parser, versioning, search, and build paths.

## Realtime model

The platform uses **near-realtime synchronization**, not uncontrolled instant publishing:

1. Connectors poll official sources.
2. Documents are normalized and hashed.
3. New versions are stored with provenance.
4. High-risk changes are marked `clinical-review-required`.
5. Chat retrieval uses the latest locally available version and exposes its status.

Research papers and trial registrations are evidence candidates. They are not automatically converted into treatment recommendations.

## Local development

```bash
cp env.example .env
npm install
```

Run the services in separate terminals:

```bash
npm run server       # Medical API, model gateway, knowledge store, production static server
npm run server:chat  # Existing JSON chat-history service on port 3001
npm run dev          # React/Vite frontend on port 3000
```

Vite proxies `/api` to `http://localhost:8787` by default.

## Production

```bash
npm install
npm run build
npm start
```

`npm start` serves the API and the built React application from `dist/`.

## Knowledge synchronization

```bash
npm run sync:knowledge
npm run sync:knowledge -- pubmed clinicaltrials.gov
```

Protected HTTP trigger:

```bash
curl -X POST http://localhost:8787/api/knowledge/sync \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sources":["pubmed","clinicaltrials.gov"]}'
```

## Core endpoints

- `GET /api/health`
- `GET /api/knowledge/status`
- `GET /api/knowledge/search?q=...&limit=...`
- `GET /api/knowledge/diseases`
- `GET /api/knowledge/diseases/:id`
- `POST /api/safety/assess`
- `POST /api/models/openrouter/stream`
- `POST /api/models/google/generate`
- `POST /api/knowledge/sync` — administrator token required

## Validation

```bash
npm test
npm run build
npm run check
```

## Clinical governance before real patient use

A production deployment still requires clinician-reviewed evaluation datasets, source-license validation, reviewer identities and approvals, encrypted patient-data controls, consent and retention policies, audit logs, rollback, penetration testing, and applicable legal/regulatory review.

See [docs/MEDICAL_KNOWLEDGE_PLATFORM.md](docs/MEDICAL_KNOWLEDGE_PLATFORM.md) for architecture and operating details.
