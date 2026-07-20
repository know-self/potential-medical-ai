# Potential Medical AI

A **conversational medical assistant platform** with streaming chat, persistent conversations, governed realtime evidence, secure collaboration, multimodal evidence upload, privacy controls, and MCP access for trusted agents.

> This project provides general educational information. It is not a diagnostic, prescribing, emergency-response, or regulated clinical decision system.

## The product is still a chat assistant

The React chat experience remains the primary product surface. Users ask questions, maintain conversations, attach evidence, add confirmed health context, and receive source-grounded responses. The supporting services exist to make that assistant safer and more reliable:

```text
Official APIs / feeds
        │
        ▼
Knowledge Control Plane :8790
  - scheduled source connectors
  - versioning and provenance
  - freshness SLOs and fail-closed policy
  - clinical review console and audit chain
  - terminology, conflicts, observability
  - private REST and MCP interfaces
        │
        ▼
Medical Chat Gateway :8787
  - server-side emergency gate
  - consented patient context and uploads
  - governed knowledge retrieval
  - evidence-grounded model routing
  - citations, privacy, sharing, capacity controls
        │
        ▼
React Chat Assistant :3000
  - streaming conversations and history
  - assistant controls for context, uploads, timeline and sharing
  - no model keys, local RAG, local clinical reasoning or medical fallback
```

MCP is a standardized interface for trusted agents. It is not the update engine. Source freshness comes from official APIs/feeds, scheduled synchronization, source timestamps, hashes, review states, and freshness policies.

## Implemented roadmap

### P0 — Clinical governance and reliability

- [x] **Clinical review console** — side-by-side versions, named reviewer decisions, configurable dual approval, rejection, rollback, and a tamper-evident audit chain.
- [x] **Medical evaluation gate in CI** — Vietnamese and English emergency, grounding, conflict, prompt-injection and translation regression suites.
- [x] **Freshness and connector observability** — freshness states, persistent metrics, Prometheus output, sync-error incidents and public degraded status.
- [x] **Source and jurisdiction registry** — authority, jurisdiction, evidence tier, guidance eligibility, license-validation status and operator approval.
- [x] **Privacy control plane foundation** — explicit consent, encrypted health data, retention, export/delete, access auditing and encryption-key rotation.

### P1 — Safer clinical collaboration

- [x] **Secure clinician sharing** — random expiring/revocable links, scoped transcript payloads, consent checks, optional redaction and access auditing.
- [x] **Structured patient context** — user-confirmed age range, medicines, allergies, reported diagnoses, pregnancy status and locale.
- [x] **Longitudinal health timeline** — encrypted user-controlled timeline events with explicit confirmation.
- [x] **Clinician export foundation** — printable HTML evidence summary and preliminary FHIR-compatible JSON bundle.

### P1 — Multimodal evidence ingestion

- [x] **Secure document and image upload foundation** — encrypted storage, MIME allowlist, signature validation, size/retention limits and de-identification.
- [x] **Evidence-preserving extraction** — line/page citations and confidence metadata; external malware scanner and document extractor adapters are supported.
- [x] **Laboratory-result explanation boundary** — compares a numeric result only against a supplied reference interval and never diagnoses.
- [x] **Medical image boundary** — images remain non-diagnostic unless a separately validated imaging service is introduced.

### P1 — Multilingual and terminology quality

- [x] **Vietnamese-first terminology layer** — aliases, abbreviations, accent-insensitive matching and medication/dose/unit preservation.
- [x] **Locale-aware evidence routing** — Vietnamese requests prefer Vietnam-applicable evidence while jurisdiction conflicts remain visible.
- [x] **Translation quality evaluation** — regression checks for negation, emergency wording, doses, pregnancy and ambiguous terminology.
- [x] **Terminology adapters** — existing WHO ICD-11 connector plus an optional licensed SNOMED FHIR terminology endpoint.

### P2 — Platform and agent capabilities

- [x] **Authenticated remote MCP foundation** — Streamable HTTP, service identities, host validation, separate read/sync authorization and read-only defaults.
- [x] **Model routing and grounded fallback policy** — task/sensitivity routing, shared evidence prompt and no ungrounded medical fallback.
- [x] **Evidence conflict resolver** — surfaces jurisdiction and recommendation disagreements rather than silently blending them.
- [x] **Cost and capacity controls** — tenant quotas, response cache and provider circuit breakers.
- [x] **Public status and incident workflow** — safe public status, private incident management and metrics.

Production dependencies and limitations are documented in [Roadmap implementation matrix](docs/ROADMAP_IMPLEMENTATION.md). In particular, real identity-provider integration, clinician sign-off, licensed terminology services, production malware scanning/extraction and external monitoring still require deployment-specific services.

## Freshness policy

- PubMed, ClinicalTrials.gov, openFDA, CDC, DailyMed, WHO ICD-11 and configured official guideline feeds are synchronized by the knowledge plane.
- Each source has a maximum-age SLO.
- Required stale, failed or never-synchronized sources make knowledge unusable when `KNOWLEDGE_FAIL_CLOSED=true`.
- High-risk changes involving dose, contraindications, pregnancy, renal/hepatic impairment, emergencies, warnings or mortality stay outside normal retrieval until review.
- Research papers, trials and adverse-event reports remain evidence candidates; they are never automatically promoted into treatment guidance.

No software can prove that an upstream medical publisher is instantaneously current or error-free. This platform makes freshness explicit and stops grounded answer generation when required freshness cannot be demonstrated.

## Unified local CLI

The `pmai` CLI starts, checks and stops the complete local stack as one process group.

```bash
cp env.example .env
npm install
npm run doctor
npm run dev
```

`npm run dev` starts:

- the private knowledge control plane;
- the medical chat gateway;
- the persistent JSON chat-history service;
- the Vite frontend;
- optional authenticated MCP HTTP when enabled.

Useful commands:

```bash
npm run dev -- --open                    # development with browser opening
npm run status                           # health of all running services
npm run pmai -- sync --sources pubmed    # authenticated source sync
npm run pmai -- help                     # every flag and port override
```

Every child process uses prefixed logs. `Ctrl+C` stops the entire process tree. Port collisions and missing dependencies fail before partial startup. See [CLI guide](docs/CLI.md).

Individual processes remain available for debugging:

```bash
npm run start:knowledge
npm run start:gateway
npm run server:chat-history
npm run dev:web
npm run mcp:knowledge
npm run start:mcp-http
```

## Local or LAN hosting

Build the frontend and host the complete stack through the gateway:

```bash
npm run host -- --open
```

Expose it to a trusted LAN:

```bash
npm run host -- \
  --host 0.0.0.0 \
  --public-host 192.168.1.25 \
  --open
```

The CLI builds with browser-visible gateway/history URLs, starts the knowledge plane, chat history and gateway in order, waits for each health endpoint, and prints all usable URLs. Use `--skip-build` to serve an existing `dist/` directory and `--mcp-http` to include authenticated Streamable HTTP MCP.

The bundled `json-server` history process is a local/LAN development convenience. **Do not expose it directly to the public internet.** Internet-facing deployment must replace or protect it with authentication, encrypted persistence, TLS/reverse proxying and an appropriate data-governance design.

Keep the knowledge plane on a private network and expose only the gateway in a production topology. Minimum production configuration includes strong independent values for model credentials, `API_ADMIN_TOKEN`, `CLINICAL_REVIEWER_TOKEN`, session signing, user-data encryption and identity-provider bootstrap. Validate source licenses before enabling feeds.

## MCP knowledge access

Local stdio server:

```bash
npm run mcp:knowledge
```

Remote Streamable HTTP server is disabled by default and requires `MCP_HTTP_ENABLED=true`, a private network, host allowlist and separate read/sync bearer identities.

The MCP layer exposes governed knowledge search, freshness status, terminology resolution, source registry and read-only clinical review information. Source synchronization remains disabled unless explicitly authorized.

## Main endpoints

### Knowledge control plane — private

- `GET /health`, `/status`, `/public/status`
- `GET /search`, `/terminology`, `/terminology/snomed`, `/diseases`, `/diseases/:id`
- `GET /admin/review-console`, `/admin/reviews`, `/admin/audit`
- `POST /admin/reviews/:id/decision`, `/admin/reviews/:id/rollback`
- `GET/PATCH /admin/sources/:id`, `POST /admin/sources/:id/approve`
- `GET/POST/PATCH /admin/incidents...`, `GET /metrics`
- `POST /sync`

### Chat gateway — public surface

- `GET /api/health`, `/api/status`
- `GET /api/knowledge/status`, `/api/knowledge/search`, `/api/knowledge/terminology`, `/api/knowledge/diseases`
- `POST /api/chat/stream`
- Privacy/context: `/api/privacy/session`, `/api/privacy/me`, `/api/privacy/consent`, `/api/privacy/context`, `/api/privacy/timeline`, `/api/privacy/export`
- Sharing: `/api/shares`, `/api/shares/public/:token`
- Evidence: `/api/uploads`, `/api/uploads/:id`, `/api/labs/explain`, `/api/images/boundary`

Direct provider endpoints and browser-side clinical orchestration are intentionally not exposed.

## Validation

```bash
npm test
npm run build
npm run check
npm run visual:test
```

`npm test` runs Node tests, medical safety/grounding evaluations, translation evaluations and a browser-boundary guard that prevents local clinical orchestration from returning to `App.jsx`.

## Explicit non-goals

- No autonomous diagnosis or prescribing.
- No automatic promotion of a paper, trial, adverse-event report or model output into treatment guidance.
- No public knowledge-control-plane access.
- No browser-side medical fallback when the gateway or required evidence is unavailable.
- No patient/clinician sharing through guessable chat identifiers.
- No claim that preliminary FHIR output is production-interoperable without terminology, conformance and privacy validation.

## Before real-patient use

A real-patient deployment still requires clinician-reviewed evaluation datasets and release approval, validated source licenses, verified reviewer identities, an external identity provider, immutable centralized audit retention, production KMS/HSM integration, consent and data-governance review, penetration testing, disaster recovery, rollback exercises and applicable legal/regulatory assessment.

See:

- [CLI guide](docs/CLI.md)
- [Knowledge control plane](docs/KNOWLEDGE_CONTROL_PLANE.md)
- [Roadmap implementation matrix](docs/ROADMAP_IMPLEMENTATION.md)
- [Medical knowledge platform](docs/MEDICAL_KNOWLEDGE_PLATFORM.md)
