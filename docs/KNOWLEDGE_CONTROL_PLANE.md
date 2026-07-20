# Medical Knowledge Control Plane

## Why MCP is not the update engine

MCP standardizes how an AI host discovers and invokes tools, reads resources, and uses prompts. It does not define when PubMed, FDA, WHO, NICE, or Ministry of Health content changes, and it does not verify that a clinical claim is correct. The platform therefore separates two responsibilities:

1. **Ingestion plane** — official API/feed polling, versioning, validation, review routing, and freshness measurement.
2. **Access plane** — REST and MCP interfaces used by the chat gateway and trusted agents.

## Runtime separation

- `knowledge-plane/server.js` is the private REST control plane and scheduler.
- `knowledge-plane/mcp.js` is the MCP stdio interface.
- `server/server.js` is the public chat gateway.
- The React frontend performs presentation and chat-history operations only.

The gateway never reads the local knowledge files directly. It calls `KNOWLEDGE_PLANE_URL`, so the knowledge service can be deployed, scaled, secured, and replaced independently.

## Freshness SLO

Each connector records its last completion status and timestamp. `evaluateFreshness()` compares that timestamp with a source-specific maximum age. Required sources that are missing, failed, or too old cause `freshness.usable=false` when fail-closed mode is enabled.

Recommended starting SLOs:

| Source | Maximum age |
|---|---:|
| openFDA drug enforcement | 6 hours |
| CDC Content Services | 12 hours |
| PubMed | 24 hours |
| DailyMed | 24 hours |
| ClinicalTrials.gov | 36 hours |
| Vietnam Ministry of Health feed | 12 hours |
| WHO/NICE guideline feeds | 24 hours |
| WHO ICD-11 release metadata | 31 days |

These values measure pipeline freshness, not upstream publication frequency. For example, a quarterly source can be polled frequently while its source data remains quarterly.

## Publish rules

- New official guidance or labels are versioned with provenance.
- High-risk changes enter `clinical-review-required` and are excluded from normal search.
- Research and trial records remain `evidence-candidate`.
- The chat gateway attaches evidence tier, review state, and source date to citations.
- If required freshness cannot be proven, the chat gateway refuses to synthesize a medical answer.

## MCP security

The MCP process is read-only by default. `sync_medical_sources` requires `MCP_ALLOW_SYNC=true` and should only run in a trusted operator environment. A remote MCP deployment should use Streamable HTTP with OAuth/service authentication, host-header validation, private networking, and per-tool authorization.

## Production hardening

Replace JSON-file persistence with PostgreSQL/object storage, use a durable queue, run multiple validators before publish, record reviewer identity and approval timestamps, and emit monitoring alerts for stale required sources, repeated connector failures, and growing clinical review queues.
