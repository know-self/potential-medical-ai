# Potential Medical AI

A **conversational medical assistant platform** with a terminal-native assistant, browser workspace, governed realtime evidence, secure collaboration, multimodal evidence upload, privacy controls, and MCP access for trusted agents.

> This project provides general educational information. It is not a diagnostic, prescribing, emergency-response, or regulated clinical decision system.

## Quick start — use `pmai`

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/know-self/potential-medical-ai.git
cd potential-medical-ai
cp env.example .env
npm install
npm link
pmai
```

`npm link` exposes the repository binary as the `pmai` command. It is normally needed only once per local checkout.

Bare `pmai` opens an interactive streaming assistant, similar to modern terminal agent CLIs:

```text
Potential Medical AI terminal assistant

medical-ai › What are the warning signs of stroke?
assistant  › ...
```

When the default local gateway is not already running, `pmai` starts the private Knowledge Control Plane and Medical Chat Gateway automatically. When the session exits, it stops only the processes it started.

### Ask once

```bash
pmai "Summarize current heart-failure guidance"
pmai ask "What are the red flags for acute chest pain?"
echo "Explain SGLT2 inhibitors" | pmai
```

### Use an existing gateway

```bash
pmai --gateway-url https://medical.example.com --no-start
```

### Repository-local form

When the binary has not been linked:

```bash
npm run chat
npm run pmai -- "Summarize hypertension guidance"
```

## Terminal commands

Inside the interactive assistant:

```text
/help                 show commands
/new                  clear the in-memory conversation
/status               show gateway and knowledge freshness
/history              print the current conversation
/attach <path>        upload and select evidence
/attachments          list selected evidence
/detach <id|all>      remove selected evidence
/token <value|clear>  set a private session token in memory
/context              read consented patient context
/save [path]          explicitly save the session as JSON
/load <path>          load a saved session
/clear                 clear the terminal screen
/exit                  quit
```

Terminal conversations remain in memory unless `/save` is used explicitly. Saved sessions exclude the private session token and use owner-only file permissions where supported.

See the complete [CLI guide](docs/CLI.md).

## Platform operations through `pmai`

The same binary manages the development and hosting stack.

```bash
pmai doctor                         # validate dependencies, secrets and ports
pmai dev --open                     # run knowledge, gateway, history and Vite
pmai status                         # inspect running services
pmai sync --sources pubmed          # trigger authenticated source sync
pmai host --open                    # build and serve the production frontend
```

Equivalent npm aliases remain available:

```bash
npm run doctor
npm run dev -- --open
npm run status
npm run host -- --open
```

### Trusted LAN hosting

```bash
pmai host \
  --host 0.0.0.0 \
  --public-host 192.168.1.25 \
  --open
```

The bundled `json-server` history process is only a local/LAN development convenience. **Do not expose it directly to the public internet or use it for real patient data.** An internet-facing deployment must replace or protect it with authentication, encrypted persistence, TLS, access auditing, and an appropriate data-governance design.

## Product surfaces

The same server-side safety, evidence, and privacy boundaries support two primary interfaces:

- **`pmai` terminal assistant** — the default quick-start experience and streaming terminal conversation.
- **React chat workspace** — browser chat, patient context, evidence review, timeline, and clinician sharing.

```text
Official APIs / feeds
        │
        ▼
Knowledge Control Plane :8790
  - scheduled source connectors
  - versioning and provenance
  - freshness SLOs and fail-closed policy
  - clinical review and audit chain
  - terminology and conflict disclosure
        │
        ▼
Medical Chat Gateway :8787
  - server-side emergency gate
  - consented context and uploads
  - evidence-grounded model routing
  - citations, privacy and capacity controls
        │
        ├── pmai terminal assistant
        └── React chat workspace :3000
```

MCP is a standardized interface for trusted agents. It is not the update engine. Freshness comes from official APIs/feeds, scheduled synchronization, source timestamps, hashes, review states, and freshness policies.

## Implemented platform roadmap

### Clinical governance and reliability

- Clinical review console with named reviewer decisions, dual approval, rejection, and rollback.
- Tamper-evident governance audit history.
- Medical, grounding, and translation evaluation gates in CI.
- Freshness metrics, source registry, incidents, and safe public status.
- Encrypted privacy foundation with consent, retention, export/delete, and key rotation.

### Clinical collaboration and evidence

- Random, expiring, and revocable clinician share links.
- Structured user-confirmed patient context and longitudinal timeline.
- Printable HTML and preliminary FHIR-compatible exports.
- Encrypted document/image upload, MIME/signature checks, and retention limits.
- Evidence-preserving extraction with page/line citations and confidence metadata.
- Numeric lab-range explanation boundary and non-diagnostic medical-image boundary.

### Terminology, MCP, and platform controls

- Vietnamese-first aliases, accent-insensitive matching, and dose/unit preservation.
- Locale-aware evidence routing and explicit jurisdiction conflicts.
- WHO ICD-11 plus optional licensed SNOMED FHIR terminology adapter.
- Read-only stdio MCP and authenticated Streamable HTTP MCP foundation.
- Task/sensitivity model routing, provider circuit breakers, quotas, and grounded cache.

Production dependencies and limitations are documented in the [Roadmap implementation matrix](docs/ROADMAP_IMPLEMENTATION.md).

## Freshness policy

- PubMed, ClinicalTrials.gov, openFDA, CDC, DailyMed, WHO ICD-11, and configured official guideline feeds are synchronized by the Knowledge Control Plane.
- Each source has a maximum-age SLO.
- Required stale, failed, or never-synchronized sources make knowledge unusable when `KNOWLEDGE_FAIL_CLOSED=true`.
- High-risk changes involving dose, contraindications, pregnancy, renal/hepatic impairment, emergencies, warnings, or mortality remain outside normal retrieval until review.
- Research papers, trials, and adverse-event reports remain evidence candidates; they are never automatically promoted into treatment guidance.

No software can prove that an upstream medical publisher is instantaneously current or error-free. This platform makes freshness explicit and stops grounded answer generation when required freshness cannot be demonstrated.

## MCP knowledge access

```bash
npm run mcp:knowledge
```

Remote Streamable HTTP MCP is disabled by default and requires a private network, host allowlist, and separate read/sync bearer identities.

## Main endpoints

Private Knowledge Control Plane:

- `GET /health`, `/status`, `/public/status`, `/search`, `/terminology`, `/diseases`
- Governance, source registry, incidents, metrics, and authenticated `/sync`

Public gateway surface:

- `GET /api/health`, `/api/status`
- `GET /api/knowledge/status`, `/api/knowledge/search`, `/api/knowledge/terminology`
- `POST /api/chat/stream`
- Privacy/context, sharing, uploads, labs, and image-boundary endpoints

Direct model-provider endpoints and browser-side clinical orchestration are intentionally not exposed.

## Validation

```bash
npm test
npm run build
npm run visual:test
```

CI checks the terminal binary, CLI parsers, SSE streaming client, server/MCP imports, clinical evaluations, browser clinical boundaries, production build, and Chromium desktop/mobile rendering.

## Explicit non-goals

- No autonomous diagnosis or prescribing.
- No automatic promotion of a paper, trial, adverse-event report, or model output into treatment guidance.
- No public Knowledge Control Plane access.
- No browser-side medical fallback when the gateway or required evidence is unavailable.
- No patient/clinician sharing through guessable chat identifiers.
- No claim that preliminary FHIR output is production-interoperable without conformance and privacy validation.

## Before real-patient use

A real-patient deployment still requires clinician-reviewed evaluation datasets and release approval, validated source licenses, verified identities, an external identity provider, immutable centralized audit retention, production KMS/HSM integration, consent and data-governance review, penetration testing, disaster recovery, and applicable legal/regulatory assessment.

See:

- [CLI guide](docs/CLI.md)
- [Knowledge Control Plane](docs/KNOWLEDGE_CONTROL_PLANE.md)
- [Roadmap implementation matrix](docs/ROADMAP_IMPLEMENTATION.md)
- [Medical knowledge platform](docs/MEDICAL_KNOWLEDGE_PLATFORM.md)
