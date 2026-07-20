# Browser clinical processing removal

The React application no longer imports or initializes RAG, model-provider, symptom-analysis, medical-safety, or healthcare-orchestrator modules. The active request path is:

`React -> POST /api/chat/stream -> server-side safety gate -> private knowledge plane -> server-side model gateway`

The deterministic emergency gate remains on the server because it must run before model generation. It is not a fallback knowledge engine and does not diagnose or select treatment.
