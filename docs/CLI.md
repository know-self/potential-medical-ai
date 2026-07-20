# Potential Medical AI CLI

`pmai` is both a terminal-native medical assistant and the process manager for the complete local platform.

## Install the command

From the repository:

```bash
cp env.example .env
npm install
npm link
```

`npm link` creates the `pmai` command in your active Node.js installation. Without linking, use `npm run chat` or `npm run pmai -- ...`.

## Terminal assistant

### Interactive mode

```bash
pmai
```

Bare `pmai` opens a streaming REPL. If the default local gateway is not reachable, the CLI starts the knowledge plane and gateway automatically. It reuses services that are already running and stops only child processes it started itself.

```text
Potential Medical AI terminal assistant
http://127.0.0.1:8787 · type /help for commands

you › What are the red flags for acute chest pain?
assistant › ...streaming grounded response...
```

### One-shot mode

```bash
pmai "Summarize current heart-failure guidance"
pmai ask "Explain SGLT2 inhibitors in CKD"
```

Machine-readable output:

```bash
pmai ask "Summarize the evidence" --json
```

Piped input:

```bash
echo "Explain hypertension staging" | pmai
cat question.txt | pmai
```

### Existing or remote gateway

```bash
pmai --gateway-url http://127.0.0.1:8787 --no-start
pmai --gateway-url https://medical.example.com --no-start
```

Set defaults in `.env`:

```env
PMAI_GATEWAY_URL=https://medical.example.com
PMAI_SESSION_TOKEN=
PMAI_LOCALE=auto
```

When `PMAI_GATEWAY_URL` is configured, the CLI treats it as an existing gateway and does not auto-start local services.

### REPL commands

| Command | Action |
|---|---|
| `/help` | Show terminal commands |
| `/new` | Clear the in-memory conversation and attachment selection |
| `/status` | Show gateway and knowledge freshness |
| `/history` | Print the current conversation |
| `/attach <path>` | Upload and select a document/image |
| `/attachments` | List selected attachment IDs |
| `/detach <id\|all>` | Remove selected evidence |
| `/token <value\|clear>` | Set a private session token for this process |
| `/context` | Read consented patient context |
| `/save [path]` | Explicitly save the session as JSON |
| `/load <path>` | Load a saved session |
| `/clear` | Clear the terminal screen |
| `/exit` | Quit |

The default session is memory-only. The CLI never writes a transcript unless `/save` is used. Saved session files use owner-only permissions where supported and never include the session token.

`Ctrl+C` cancels an active stream. Press it again while idle to exit.

### Private context and uploads

Provide a user session token through an environment variable or inside the REPL:

```bash
PMAI_SESSION_TOKEN=... pmai
```

```text
/token eyJ...
/attach ./guideline.pdf
/context
```

The token remains in process memory and is not included when saving a terminal session.

## Web development stack

```bash
pmai dev --open
```

This starts, in dependency order:

1. knowledge control plane on `8790`;
2. JSON chat history on `3001`;
3. medical chat gateway on `8787`;
4. optional authenticated MCP HTTP on `8791`;
5. Vite on `3000`.

Equivalent repository command:

```bash
npm run dev -- --open
```

Useful variants:

```bash
pmai dev --no-sync
pmai dev --mcp-http
pmai dev --gateway-port 8887 --knowledge-port 8890
```

The process manager waits for each HTTP endpoint before starting the next dependency. HTTP `503` is considered reachable-but-degraded because fail-closed freshness may intentionally lock medical answers before initial synchronization.

## Local production hosting

```bash
pmai host --open
```

`host` builds Vite and serves `dist/` from the gateway. Vite does not remain running.

Serve an existing build:

```bash
pmai host --skip-build
npm start
```

Trusted-LAN example:

```bash
pmai host \
  --host 0.0.0.0 \
  --public-host 192.168.1.25 \
  --open
```

The CLI derives browser-visible gateway/history URLs and injects consistent ports, proxy targets, CORS origins and knowledge-plane URLs.

## Operations

### Doctor

```bash
pmai doctor
pmai doctor --json
```

Checks Node.js, dependencies, `.env`, provider credentials, administrator/privacy secrets, ports and production build presence where applicable.

### Status

```bash
pmai status
pmai status --json
```

Reads gateway, knowledge-plane and chat-history health without starting services.

### Knowledge synchronization

```bash
pmai sync
pmai sync --sources pubmed,clinicaltrials.gov
```

Requires `API_ADMIN_TOKEN` and calls the private knowledge-plane synchronization endpoint.

## Common options

| Option | Purpose | Default |
|---|---|---:|
| `--gateway-url` | Existing gateway for terminal chat | local gateway |
| `--session-token` | Private context/upload token | `PMAI_SESSION_TOKEN` |
| `--locale` | Terminal request locale | `auto` |
| `--no-start` | Never auto-start terminal backend services | disabled |
| `--host` | Bind address for web/gateway/history | `127.0.0.1` |
| `--public-host` | Browser-visible hostname/IP | local or detected LAN IP |
| `--web-port` | Vite port | `3000` |
| `--gateway-port` | Gateway/static host port | `8787` |
| `--knowledge-port` | Private knowledge-plane port | `8790` |
| `--history-port` | JSON chat-history port | `3001` |
| `--mcp-http` | Include authenticated remote MCP | disabled |
| `--mcp-port` | MCP HTTP port | `8791` |
| `--no-sync` | Disable automatic connector synchronization | disabled |
| `--skip-build` | Serve existing `dist/` | disabled |
| `--open` | Open the browser | disabled |
| `--env-file` | Load another env file | `.env` |
| `--json` | Machine-readable one-shot/doctor/status output | disabled |
| `--no-color` | Disable ANSI terminal styling | disabled |

## Process behavior

- Ports are checked before the complete web stack starts.
- Child logs use service prefixes.
- Unexpected child exit stops the remaining stack.
- `SIGINT` and `SIGTERM` terminate process groups.
- The terminal assistant starts only the knowledge plane and gateway; it does not need Vite or JSON chat history.
- The knowledge plane remains private even when the hosted web surface binds to `0.0.0.0`.

## Security boundary

The terminal assistant and local process manager are intended for development, test environments and trusted deployments.

The bundled `json-server` chat-history process has no authentication or encryption. Do not expose it directly to the public internet or use it for real patient data. Production hosting requires authenticated persistence, encryption, TLS, access auditing and applicable privacy governance.

Remote MCP remains disabled unless explicitly enabled. Use independent strong read/sync tokens, a private network and a restrictive host allowlist.

## Troubleshooting

### Terminal answer is blocked as stale

Run:

```bash
pmai status --json
```

Resolve source network/credentials or run an authenticated sync. Fail-closed behavior intentionally refuses unverified stale knowledge.

### Gateway cannot start

```bash
pmai doctor
```

Change only the conflicting ports; dependent URLs are derived automatically.

### Use a gateway already running elsewhere

```bash
pmai --gateway-url https://medical.example.com --no-start
```

### Remove the linked command

```bash
npm unlink -g potential-medical-ai
```
