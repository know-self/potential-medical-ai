# Stability-first roadmap

This roadmap separates what is safe to ship now from work that requires a dedicated migration, production infrastructure, or clinical validation.

## Release baseline — v3.3.0

The release branch must contain, and CI must verify:

- Windows-safe `pmai` process startup.
- Browser and terminal custom OpenAI-compatible model configuration.
- Direct Model, Document RAG, and Knowledge RAG modes.
- Invalid-session recovery without request fan-out or retry loops.
- Emergency and crisis safety gates before model invocation.
- Endpoint network policy, blocked metadata/private destinations, and safe custom headers.
- Node tests, medical and translation evaluations, production build, Windows smoke tests, and Chromium responsive rendering.

Run the local release gate with:

```bash
npm run release:check
```

The GitHub workflow additionally runs Chromium visual tests and Windows-specific runtime tests.

## P1 — Model setup reliability

Deliver in a focused minor release:

- Connection test that uses the configured endpoint without saving the key server-side.
- Optional `/models` discovery with graceful fallback when unsupported.
- Presets for generic OpenAI-compatible, Ollama-compatible proxy, LM Studio, and vLLM.
- Clear error categories for DNS, TLS, authentication, timeout, missing model, and context overflow.
- Per-chat model profile selection without persisting secrets in transcripts.

Exit criteria: a new user can configure a local model and receive a verified response without editing source code.

## P2 — Document RAG quality

- Malware scanning adapter and quarantine state.
- PDF text extraction with page mapping.
- OCR adapter for scanned documents.
- Deterministic chunking with file/page/offset provenance.
- Hybrid lexical/vector retrieval and optional reranking.
- Prompt token budgeting and citation validation.
- No full-document forwarding when only selected chunks are relevant.

Exit criteria: every document-grounded claim can be traced to a file, page, chunk, and extraction confidence.

## P3 — Product structure

Split Assistant controls into four focused surfaces:

1. Model settings.
2. Context and privacy.
3. Documents and retrieval.
4. Clinical collaboration.

Keep the chat surface primary and expose current model mode/status in the top bar.

Exit criteria: model credentials cannot be confused with secure patient-session credentials, and all controls remain usable on mobile.

## P4 — Production backend

Replace local-only components before internet or real-patient use:

- `json-server` history with an authenticated API.
- File stores with a transactional database and schema migrations.
- Local keys with KMS/HSM-backed envelope encryption.
- Bootstrap tokens with OIDC/OAuth identity.
- In-process rate limits with distributed limits.
- Local uploads with encrypted object storage and lifecycle policies.
- In-process jobs with a durable queue.
- Structured logs, metrics, traces, backups, and disaster recovery.

Exit criteria: tenant isolation, retention, audit, restore, and key rotation are tested in a staging environment.

## P5 — Model and safety evaluation

Evaluate Direct Model, Document RAG, and Knowledge RAG separately across:

- Emergency and crisis cases.
- Medication and individualized dose requests.
- Pregnancy, renal, hepatic, pediatric, and geriatric scenarios.
- Vietnamese medical terminology and translation preservation.
- Prompt injection inside uploaded documents.
- Conflicting guidelines and insufficient evidence.
- Hallucinated citations and unsupported claims.
- Long-context truncation, latency, and stream failures.

Exit criteria: release thresholds are explicit, versioned, and block deployment when regressed.

## P6 — Observability and operations

Track endpoint/model latency, first-token latency, completion rate, token usage, upstream failures, retrieval hit rate, citation verification failures, safety-gate activations, and authentication failures. Never log API keys, private context, raw documents, or session tokens.

## P7 — Product hardening

After the backend and evaluation foundations are stable:

- Onboarding wizard and endpoint presets.
- Conversation search, retry, regenerate, and cancellation.
- Context-budget indicator.
- Document library and per-chat retrieval controls.
- Accessibility and keyboard navigation audits.
- Docker Compose and optional desktop packaging.
- Versioned browser-setting migrations.

## Change policy

- Do not combine React, Vite, Tailwind, Zod, storage, and identity major migrations in one PR.
- Every major migration needs an isolated compatibility plan and rollback path.
- Keep provider-specific credentials out of the server configuration.
- Keep model keys tab/process scoped unless a dedicated secret vault is introduced.
- Never claim real-patient readiness solely from unit tests or model evaluations.
