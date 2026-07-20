# PMAI terminal assistant quick reference

```bash
npm install
npm link
pmai
```

Bare `pmai` opens a streaming REPL and auto-starts the local knowledge plane and gateway when needed.

```bash
pmai "Summarize current heart-failure guidance"
pmai ask "Explain CKD staging" --json
echo "What are stroke red flags?" | pmai
```

Use an existing gateway:

```bash
pmai --gateway-url https://medical.example.com --no-start
```

Key REPL commands: `/help`, `/new`, `/status`, `/history`, `/attach`, `/attachments`, `/detach`, `/token`, `/context`, `/save`, `/load`, `/exit`.

Terminal conversations are memory-only unless `/save` is explicitly used. Session tokens are never written into saved session files.
