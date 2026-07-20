# Potential Medical AI CLI

The `pmai` command is the single entrypoint for running the local platform. It coordinates the knowledge plane, chat gateway, chat-history service, Vite frontend and optional remote MCP process.

## Quick start

```bash
cp env.example .env
npm install
npm run doctor
npm run dev -- --open
```

Stop the complete stack with `Ctrl+C`. The CLI terminates every child process in reverse startup order.

## Commands

### `pmai dev`

Starts the complete development stack:

1. knowledge control plane on `8790`;
2. JSON chat history on `3001`;
3. medical chat gateway on `8787`;
4. optional authenticated MCP HTTP on `8791`;
5. Vite on `3000`.

The CLI waits for every HTTP endpoint before starting the next dependency. A `503` from the knowledge plane or gateway is considered reachable but degraded because fail-closed freshness may intentionally block answers before initial synchronization.

```bash
npm run dev
npm run dev -- --open
npm run dev -- --no-sync
npm run dev -- --mcp-http
```

### `pmai host`

Builds the Vite frontend and hosts it from the gateway. Vite is not kept running.

```bash
npm run host -- --open
```

Host an existing build without rebuilding:

```bash
npm start
# equivalent to: node bin/pmai.js host --skip-build
```

Trusted LAN example:

```bash
npm run host -- \
  --host 0.0.0.0 \
  --public-host 192.168.1.25 \
  --gateway-port 8787 \
  --history-port 3001 \
  --open
```

`--public-host` is embedded in the production build for browser-visible chat-history requests. When binding to `0.0.0.0`, the CLI attempts to select the first LAN IPv4 address if `--public-host` is omitted.

### `pmai doctor`

Checks:

- supported Node.js version;
- dependency installation;
- `.env` availability;
- model-provider configuration;
- administrator and privacy secrets;
- port availability;
- production build presence when applicable.

```bash
npm run doctor
npm run doctor -- --json
```

Warnings do not fail the command. Missing required files or an unsupported Node version do.

### `pmai status`

Reads the health of running services without starting them:

```bash
npm run status
npm run status -- --json
```

### `pmai sync`

Triggers the private knowledge-plane synchronization endpoint using `API_ADMIN_TOKEN` from `.env`.

```bash
npm run pmai -- sync
npm run pmai -- sync --sources pubmed,clinicaltrials.gov
```

## Options

| Option | Purpose | Default |
|---|---|---:|
| `--host` | Bind address for public local services | `127.0.0.1` |
| `--public-host` | Hostname/IP used by the browser | `localhost` or detected LAN IPv4 |
| `--web-port` | Vite development port | `3000` |
| `--gateway-port` | Chat gateway and production frontend port | `8787` |
| `--knowledge-port` | Private knowledge-plane port | `8790` |
| `--history-port` | JSON chat-history port | `3001` |
| `--mcp-http` | Start authenticated Streamable HTTP MCP | disabled |
| `--mcp-port` | MCP HTTP port | `8791` |
| `--no-sync` | Disable automatic connector synchronization | disabled |
| `--skip-build` | Serve the existing `dist/` directory | disabled |
| `--open` | Open the browser after startup | disabled |
| `--env-file` | Load a different environment file | `.env` |
| `--json` | Machine-readable `doctor` or `status` output | disabled |

CLI flags override environment variables. Existing process environment variables override values loaded from the env file.

## Environment mapping

The CLI derives and injects these runtime values consistently:

- `PORT` and `HOST` for the gateway;
- `KNOWLEDGE_PLANE_PORT`, `KNOWLEDGE_PLANE_HOST` and `KNOWLEDGE_PLANE_URL`;
- `MEDICAL_API_PROXY_TARGET` for Vite;
- same-origin `VITE_MEDICAL_API_URL`;
- browser-visible `VITE_API_BASE_URL` for history;
- `ALLOWED_ORIGINS` and `APP_PUBLIC_URL`;
- `MCP_HTTP_ENABLED` and `MCP_HTTP_PORT`;
- `SYNC_ENABLED` when `--no-sync` is supplied.

This removes the most common source of local failures: frontend, gateway and knowledge services using inconsistent ports or hostnames.

## Process behavior

- Ports are checked before the first service starts.
- Child logs are prefixed with the service name.
- Any unexpected child exit stops the remaining stack.
- `SIGINT` and `SIGTERM` stop the process group.
- Production hosting builds before binding service ports unless `--skip-build` is used.
- The knowledge plane remains bound to its configured private host even when the web/gateway bind address is `0.0.0.0`.

## Security boundary

The CLI is intended for local development, test environments and trusted LAN demonstrations.

The bundled `json-server` chat-history process has no authentication or encryption. Do not expose it directly to the public internet or use it for real patient data. A production deployment must replace or protect it with authenticated APIs, encrypted storage, TLS, access auditing and applicable privacy controls.

Remote MCP remains disabled unless explicitly enabled. Use independent strong read and sync tokens, a private network and a restrictive host allowlist.

## Troubleshooting

### Port is already in use

Run:

```bash
npm run doctor
```

Then override only the conflicting port:

```bash
npm run dev -- --gateway-port 8887 --knowledge-port 8890
```

The CLI updates dependent URLs automatically.

### Knowledge or gateway reports HTTP 503

This can be expected before required sources complete their first synchronization. Inspect:

```bash
npm run status -- --json
```

If synchronization is disabled or failed, resolve source credentials/network access or trigger an authenticated sync.

### LAN page loads but chat history fails

Set the machine address that browsers can reach:

```bash
npm run host -- --host 0.0.0.0 --public-host 192.168.1.25
```

Also permit the history port through the host firewall. Do not expose that port beyond a trusted local network.

### Browser does not open

Opening is optional and may be unavailable in containers or remote shells. Copy the printed `App` URL into a browser instead.
