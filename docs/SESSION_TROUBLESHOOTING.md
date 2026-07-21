# Secure session troubleshooting

## Repeated `Invalid authentication token` messages

A user-session token is signed with `USER_SESSION_SIGNING_KEY`. It becomes invalid when it expires, when the signing key changes, or when a token from another environment is reused.

The application now handles this automatically:

- browser tokens are typed into a draft field and are not sent until **Verify and use** is selected;
- a stale token restored from `sessionStorage` is checked once, removed, and the UI continues in public-chat mode;
- private attachment selections are cleared whenever the session is cleared;
- a chat request that receives `401` is retried once without private context or attachments;
- terminal chat clears an invalid in-memory token and retries once in anonymous mode;
- expected `401/403` authentication failures are structured client errors rather than server crashes.

## Manual browser reset

The UI provides **Assistant controls → Secure session → Clear**. A manual DevTools reset is also possible:

```js
sessionStorage.removeItem('medical-user-session')
location.reload()
```

## Manual terminal reset

Inside `pmai`:

```text
/token clear
```

In PowerShell, remove an inherited environment token before starting the CLI:

```powershell
Remove-Item Env:PMAI_SESSION_TOKEN -ErrorAction SilentlyContinue
pmai
```

## Issuing a new local session

User sessions must be issued through the configured bootstrap or identity flow. Do not expose `USER_BOOTSTRAP_TOKEN` in browser code or any `VITE_*` variable.

For a trusted local operator, request a short-lived session from the gateway with the bootstrap token supplied only in the server-side/terminal request:

```powershell
$headers = @{ Authorization = "Bearer $env:USER_BOOTSTRAP_TOKEN" }
$body = @{ userId = "local-user" } | ConvertTo-Json
$session = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/privacy/session `
  -Headers $headers `
  -ContentType application/json `
  -Body $body

$session.token
```

Paste the returned token into **Assistant controls → Secure session**, then select **Verify and use**. Do not commit tokens or signing/bootstrap secrets to source control.
