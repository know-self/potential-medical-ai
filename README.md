# Potential Medical AI

A conversational medical assistant with a terminal-native CLI, browser workspace, custom OpenAI-compatible model runtime, optional document/knowledge RAG, secure uploads, privacy controls, and MCP knowledge access.

> This project provides general educational information. It is not a diagnostic, prescribing, emergency-response, or regulated clinical decision system.

## Quick start — browser workspace

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/know-self/potential-medical-ai.git
cd potential-medical-ai
cp env.example .env
npm install
npm link
pmai dev --open
```

The browser opens at `http://localhost:3000`.

Configure the local gateway before starting the app by setting `PMAI_MODEL_ENDPOINT`, `PMAI_MODEL_NAME`, and (when required) `PMAI_MODEL_API_KEY` in `.env`. Temperature, maximum output tokens, an optional system instruction, and optional request headers are also configured there.

Example endpoints:

```text
https://models.example.com/v1/chat/completions
http://127.0.0.1:1234/v1/chat/completions
http://localhost:11434/v1/chat/completions
```

The gateway reads model credentials from its local environment; they are not exposed to browser storage. Users sign in with email/password before opening the chat workspace, which keeps uploads and private context account-scoped.

### Automatic evidence routing

Attached documents are always routed to retrieval with `[D#]` source markers. The local knowledge plane is selected automatically for evidence-sensitive or high-sensitivity medical questions, while greetings and simple conversation skip it. The Tools page makes each local orchestration step visible without exposing model credentials or requiring a manual mode choice.

The local gateway remains in the path for emergency/safety screening, rate limits, account handling, upload access control, endpoint network policy, and streaming normalization.

## Custom endpoint security policy

By default:

- Public remote endpoints must use HTTPS.
- HTTP is permitted only for loopback hosts such as `localhost`, `127.0.0.1`, and `::1`.
- Link-local metadata services and private/reserved DNS resolutions are blocked.
- URL-embedded credentials are rejected.
- Dangerous forwarded headers such as `Host`, `Cookie`, `Authorization`, and `Content-Length` are filtered.

For a trusted LAN model endpoint, explicitly opt in:

```env
CUSTOM_MODEL_ALLOW_PRIVATE_NETWORK=true
```

A deployment can restrict model hosts:

```env
CUSTOM_MODEL_ALLOWED_HOSTS=models.example.com,api.internal.example
```

Do not enable private-network model access on a public/shared gateway unless the network boundary is independently protected.

## Terminal assistant

The terminal uses the same generic model runtime. Configure it with flags:

```bash
pmai \
  --model-endpoint http://127.0.0.1:1234/v1 \
  --model local-model \
  --mode direct
```

Or with generic environment variables:

```env
PMAI_MODEL_ENDPOINT=http://127.0.0.1:1234/v1
PMAI_MODEL_NAME=local-model
PMAI_MODEL_API_KEY=
PMAI_MODEL_TEMPERATURE=0.2
PMAI_MODEL_MAX_TOKENS=4096
```

Then run:

```bash
pmai
pmai "Explain the warning signs of stroke"
pmai ask "Summarize this topic"
echo "Explain SGLT2 inhibitors" | pmai
```

Terminal model keys remain in the current process. `/save` never writes the model key or private session token.

### Terminal commands

```text
/help                 show commands
/new                  clear the in-memory conversation
/status               show gateway, model mode, and knowledge status
/model                show endpoint host, model, and mode
/mode <mode>          direct, document-rag, or knowledge-rag
/history              print the current conversation
/attach <path>        upload and select a document
/attachments          list selected documents
/detach <id|all>      remove selected documents
/token <value|clear>  set a private session token in memory
/context              read consented patient context
/save [path]          explicitly save transcript and attachment IDs
/load <path>          load a saved session
/clear                 clear the terminal screen
/exit                  quit
```

## Platform operations

```bash
pmai doctor                         # validate dependencies, secrets and ports
pmai dev --open                     # run gateway, history, Vite, and optional knowledge service
pmai status                         # inspect running services
pmai sync --sources pubmed          # synchronize optional knowledge sources
pmai host --open                    # build and serve the production frontend
```

Equivalent npm aliases:

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

The bundled `json-server` history process is only a local/LAN development convenience. Do not expose it directly to the public internet or use it for real patient data. An internet-facing deployment must replace or protect it with authentication, encrypted persistence, TLS, access auditing, and an appropriate data-governance design.

## Architecture

```text
Browser / pmai terminal
        │
        │ per-session endpoint, model, API key, mode
        ▼
Local Medical Safety Gateway :8787
  - deterministic emergency gate
  - custom endpoint validation and SSRF controls
  - secure sessions and consented context
  - encrypted uploads and extraction access
  - streaming normalization and quotas
        │
        ├── Direct Model ───────────────► custom OpenAI-compatible endpoint
        │
        ├── Document RAG ─► uploads ───► custom OpenAI-compatible endpoint
        │
        └── Knowledge RAG
                │
                ▼
        Knowledge Control Plane :8790
          - source synchronization
          - versioning and provenance
          - freshness and fail-closed policy
          - review state and conflicts
                │
                └───────────────────────► custom OpenAI-compatible endpoint
```

No OpenRouter-specific or Google-specific model configuration is required or loaded by the server.

## Privacy behavior

- Browser model settings live only in `sessionStorage` for the current tab.
- The gateway forwards the API key upstream only for that request.
- Model keys are not persisted by PMAI.
- Secure patient context and upload access still require a verified short-lived user session.
- Including patient context in model prompts is an explicit model-setting toggle.
- Direct Model mode does not include uploads, Knowledge Plane data, or patient context unless the applicable mode/toggle is enabled.

## Optional Knowledge RAG

The Knowledge Control Plane can synchronize PubMed, ClinicalTrials.gov, openFDA, CDC, DailyMed, WHO ICD-11, and configured official feeds. Each source has a maximum-age policy and review state.

`KNOWLEDGE_FAIL_CLOSED=true` affects only Knowledge RAG. Direct Model and Document RAG remain available when knowledge is unavailable or stale.

MCP knowledge access remains available:

```bash
npm run mcp:knowledge
```

Remote Streamable HTTP MCP is disabled by default and requires a private network, host allowlist, and separate read/sync bearer identities.

## Main endpoints

Private Knowledge Control Plane:

- `GET /health`, `/status`, `/public/status`, `/search`, `/terminology`, `/diseases`
- Governance, source registry, incidents, metrics, and authenticated `/sync`

Gateway:

- `GET /api/health`, `/api/status`
- `GET /api/knowledge/status`, `/api/knowledge/search`, `/api/knowledge/terminology`
- `POST /api/chat/stream` using the gateway's environment-configured model
- Privacy/context, sharing, uploads, labs, and image-boundary endpoints

## Validation

```bash
npm test
npm run build
npm run visual:test
```

CI checks the terminal binary, generic model settings, SSE streaming, endpoint policy, server/MCP imports, medical evaluations, browser clinical boundaries, production build, Windows startup, and Chromium desktop/mobile rendering.

## Explicit non-goals

- No autonomous diagnosis or prescribing.
- No automatic promotion of model output into treatment guidance.
- No automatic promotion of a paper, trial, or adverse-event report into guidance.
- No silent patient-context inclusion.
- No server-side storage of user-supplied model API keys.
- No unrestricted proxying to private networks or metadata services.
- No claim that preliminary FHIR output is production-interoperable without conformance and privacy validation.

## Before real-patient use

A real-patient deployment still requires clinician-reviewed evaluation datasets and release approval, validated source licenses, verified identities, an external identity provider, immutable centralized audit retention, production KMS/HSM integration, consent and data-governance review, penetration testing, disaster recovery, and applicable legal/regulatory assessment.

See:

- [CLI guide](docs/CLI.md)
- [Knowledge Control Plane](docs/KNOWLEDGE_CONTROL_PLANE.md)
- [Roadmap implementation matrix](docs/ROADMAP_IMPLEMENTATION.md)
- [Medical knowledge platform](docs/MEDICAL_KNOWLEDGE_PLATFORM.md)
