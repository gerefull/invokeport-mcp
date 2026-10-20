# Clean local connection

For npm installation and MCP host settings, see README.md. The examples below
are for contributors working from the source repository. From its root, with
Node and npm installed, run `npm ci` and `npm run verify:site`.

Have the owner privately configure `INVOKEPORT_ORIGIN` and a limited
`INVOKEPORT_API_KEY` in the process environment. The origin must point to the
local FREE build or `https://invokeport.com`. Use a key issued by that same
origin. The key needs `tools:invoke`,
an enabled policy allowing `json-schema`, and available quota. No author cookie,
founder's model subscription or wallet session is inherited by these examples.
Never paste a real key into a prompt, command argument, screenshot or commit.

## Plain JavaScript HTTP

```powershell
node example.mjs
node example.mjs --invalid
```

The first command searches, reads the selected example, creates an attempt ID,
invokes the real JSON Schema tool and prints bounded JSON including request ID.
The second intentionally sends `{}`, reports `input_rejected` and exits 1.
No LLM is used. On an uncertain invocation it reports the original attempt ID.
Do not rerun with a new ID to resolve uncertainty: repeated reserved attempts
return metadata only, not the original result. Keep the local result yourself
if needed; the server does not retain it.

## curl from PowerShell

The following passes config to curl through stdin, avoiding credential-bearing
command-line arguments and temporary files. Use only an owner-selected local
origin. No curl default config, redirects, retry, cookies or payment flags:

```powershell
if ($env:INVOKEPORT_ORIGIN -notmatch '^http://127\.0\.0\.1:[0-9]+$') { throw 'Set a local test origin' }
if ($env:INVOKEPORT_API_KEY -notmatch '^[A-Za-z0-9_-]{16,256}$') { throw 'Set a limited key privately' }
$attemptId = [guid]::NewGuid().ToString()
$curlConfig = @"
silent
show-error
max-time = 20
request = "POST"
url = "$env:INVOKEPORT_ORIGIN/api/tools/json-schema"
header = "Content-Type: application/json"
header = "Authorization: Bearer $env:INVOKEPORT_API_KEY"
header = "Idempotency-Key: $attemptId"
data = "{\"schema\":{\"type\":\"integer\"},\"value\":2}"
"@
$curlConfig | curl.exe --disable --config -
Remove-Variable curlConfig
```

Expected JSON: `valid:true`, `builtin:true`, `mode:"free-beta"`, request ID.
Inspect the JSON error even when curl exits 0: curl transport success does not
mean application success. 401 means key/auth; 403 policy/tool; 429 quota; 400
invalid input; 409 existing/conflicting attempt. Network interruption/5xx is
an uncertain outcome; do not automatically repeat with a new attempt ID.

## MCP host

Configure the host command as an absolute `node.exe` path and its one argument
as the absolute `packages/mcp-connector/server.mjs` path. Supply the two private
environment entries through the host's local settings. No configuration with
real keys is included in this repository. The three tools are advertised by
the STDIO handshake; `get_capability` must precede invocation when choosing input.

## Reproducible acceptance

```powershell
node --test packages/mcp-connector/test/*.test.mjs
node scripts/verify-site-owner-isolation.mjs --mcp --examples
```

The fixture creates a fresh database and fresh limited keys, invokes the actual
JavaScript subprocess and system curl with a minimal environment, tests the
invalid-input exit path, checks MCP and its journal, then revokes keys and
removes fixture data. Secrets remain in memory and are not printed. This is
local integration evidence, not external beta adoption or mainnet settlement.
