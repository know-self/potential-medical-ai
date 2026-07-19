# Roadmap implementation matrix

This document maps every roadmap phrase to its implementation, verification and production dependency. “Implemented” means the repository contains an end-to-end guarded foundation; it does not imply regulatory clearance or that an optional external service has been purchased and configured.

## Product boundary

Potential Medical AI remains a conversational assistant. The React application owns chat presentation and history. Clinical processing runs in the chat gateway and private knowledge control plane. Browser-side model providers, RAG, emergency classification and medical fallback are prohibited by CI.

## P0 — Clinical governance and reliability

| Roadmap phrase | Implementation | Verification | Production dependency |
|---|---|---|---|
| Clinical review console | `admin/review-console.html`, `knowledge-plane/governance.js`, review/decision/rollback routes | `tests/governance.test.js` | Verified reviewer identity, centralized immutable audit retention, clinical operating policy |
| Medical evaluation gate in CI | `evals/*`, `scripts/run-*-evals.js`, CI workflow | `npm run eval:medical`, `npm run eval:translation` | Clinician-authored and approved release dataset with maintained thresholds |
| Freshness and connector observability | `knowledge-plane/observability.js`, freshness SLOs, `/metrics`, incident routes | freshness tests and sync failure paths | External metrics/alerting sink and on-call process |
| Source and jurisdiction registry | `knowledge-plane/sourceRegistry.js`, source routes | source service checks | Legal/license review and approved feed inventory |
| Privacy control plane | `server/privacy.js`, encrypted stores, consent, export/delete, retention, audit and key rotation | `tests/privacySharing.test.js` | Identity provider, production KMS/HSM, privacy impact assessment |

## P1 — Safer clinical collaboration

| Roadmap phrase | Implementation | Verification | Production dependency |
|---|---|---|---|
| Secure clinician sharing | `server/sharing.js`, random token hash, expiry, revoke, redaction and access log | sharing tests | Clinician authentication/viewer experience and organizational consent policy |
| Structured patient context | Assistant control panel and encrypted confirmed context | privacy tests | Validated UX, schema governance and identity-provider integration |
| Longitudinal health timeline | User-confirmed encrypted events | privacy tests | Clinical terminology validation and retention policy |
| Clinician export | Printable HTML and preliminary FHIR-compatible bundle | privacy/export checks | FHIR conformance, terminology mapping, receiving-system testing |

## P1 — Multimodal evidence ingestion

| Roadmap phrase | Implementation | Verification | Production dependency |
|---|---|---|---|
| Secure upload | `server/uploads.js`, encrypted objects/metadata, allowlist, signature/size/retention controls | `tests/uploads.test.js` | Production malware scanner, isolated object store and DLP controls |
| Evidence-preserving extraction | Line/page citations, confidence, external extractor adapter | upload tests | Validated OCR/document extraction service and extraction-quality evaluations |
| Laboratory explanation | `server/labs.js`, range-only comparison and disclaimers | roadmap-control tests | Unit/reference-range source validation and clinical UX review |
| Medical image boundary | Explicit non-diagnostic endpoint and disabled analysis flag | roadmap-control tests | A separately validated and regulated imaging workflow if ever enabled |

## P1 — Multilingual and terminology quality

| Roadmap phrase | Implementation | Verification | Production dependency |
|---|---|---|---|
| Vietnamese-first terminology | `knowledge-plane/terminology.js`, aliases, accent-insensitive matching, dose/unit preservation | translation eval | Clinical terminology curation and ongoing reviewer maintenance |
| Locale-aware routing | Vietnam-first jurisdiction preference and visible conflicts | translation/conflict tests | Complete licensed Vietnam guideline inventory |
| Translation evaluation | Vietnamese/English regression cases | `npm run eval:translation` | Clinician-reviewed multilingual benchmark expansion |
| ICD/SNOMED | WHO ICD connector and optional SNOMED FHIR adapter | terminology routes | WHO credentials and a licensed SNOMED terminology server |

## P2 — Platform and agent capabilities

| Roadmap phrase | Implementation | Verification | Production dependency |
|---|---|---|---|
| Authenticated remote MCP | `knowledge-plane/mcp-http.js`, Streamable HTTP, host allowlist and separate read/sync identities | CI module/build validation | Private networking; deployment-specific OAuth or workload identity if required |
| Model routing/fallback | `server/modelRouter.js`, sensitivity/task routing and grounded same-evidence fallback | routing tests | Provider-specific evaluation, budgets and service agreements |
| Evidence conflict resolver | `knowledge-plane/conflicts.js` and conflict-aware prompts | conflict tests | Clinical policy for adjudication and jurisdiction precedence |
| Cost/capacity controls | `server/capacity.js`, quotas, cache and circuit breakers | control tests | Distributed state/storage for multi-instance deployment |
| Public status/incidents | gateway public status plus private incident workflow | status paths | External status page, monitoring and incident-response ownership |

## Release gates

A production medical answer should be blocked when any applicable gate fails:

1. Server-side emergency assessment runs first.
2. Required knowledge sources must satisfy freshness SLOs.
3. High-risk changes require the configured number of distinct reviewer approvals.
4. Retrieval must return usable evidence and citations.
5. Conflicting evidence must be disclosed rather than merged silently.
6. The selected provider receives the same governed evidence context; no ungrounded fallback is allowed.
7. User health context, timeline, upload or sharing operations require scoped identity and consent.
8. CI medical, translation and browser-boundary gates must pass before release.

## Remaining operational work

The repository cannot by itself supply real clinician identities, legal permission to reuse every source, production KMS/HSM, licensed SNOMED access, a malware scanner, OCR service, external monitoring, or regulatory approval. The adapters and boundaries are implemented; operators must configure and validate those external dependencies before real-patient use.
