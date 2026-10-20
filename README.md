# InvokePort — data infrastructure for AI agents

Connect once and let an agent call seven deterministic data tools through remote MCP:
**JSON Schema validation, JSON to TypeScript, CSV to JSON, JSON repair and JSON to CSV**,
plus OpenAPI security and webhook checks. No LLM calls or USDC payments are needed for these built-ins.

## Connect with remote MCP

Endpoint: `https://invokeport.com/api/mcp`

Use a client supporting Streamable HTTP and custom Authorization headers. For example,
Claude Code's private MCP configuration can expand a privately configured environment variable:

```json
{
  "mcpServers": {
    "invokeport": {
      "type": "http",
      "url": "https://invokeport.com/api/mcp",
      "headers": { "Authorization": "Bearer ${INVOKEPORT_API_KEY}" }
    }
  }
}
```

[Client setup and key issuance](https://invokeport.com/agents).
Discovery (`initialize` and `tools/list`) is public. Execution requires a scoped
`tools:invoke` key, allowed tool IDs and quota; initial key setup uses wallet sign-in
and a profile. Keep the key in private client settings, never in a prompt or tool argument.

The endpoint supports legacy MCP through **2025-11-25** with SDK 1.30.0.
It does not implement MCP 2026-07-28 or OAuth. The hosted endpoint version is 0.3.0;
the independent local STDIO package below remains 0.2.0.

Remote discovery returns seven direct tools:
`invokeport_json_repair`, `invokeport_json_schema`, `invokeport_json_csv`,
`invokeport_json_types`, `invokeport_csv_json`, `invokeport_openapi_security`,
`invokeport_webhook_check`.
Each takes `{input, attemptId}` with the actual input schema. A fresh non-secret
16–128 character attempt ID identifies each intended call. Quota, scope, revocation
and the existing invocation journal apply. Reserved attempts cannot execute again;
uncertain outcomes need reconciliation, not automatic retries.

## First useful agent workflow

**Malformed LLM JSON → repair → validate a known schema → CSV.**
[Run the complete example](https://invokeport.com/agents/workflows/json-pipeline)
or download [agent-workflow.mjs](https://invokeport.com/downloads/agent-workflow.mjs).

```sh
npm install @modelcontextprotocol/sdk@1.30.0
node agent-workflow.mjs
# After configuring a private key allowing json-repair, json-schema and json-csv:
node agent-workflow.mjs --run
```

Node >=22.5.0. Without `--run` this only lists tools. With it, the synthetic
example performs three free calls and stops if schema validation fails or a result
is unavailable. It returns a two-row CSV and three request IDs to inspect in the
owner's journal. Each started attempt is reported before its request; no automatic retries.
Repair is best effort, schema validation supports a bounded structural subset, and
CSV accepts flat rows. Outputs above 32 KiB are explicitly omitted.

Building an agent that needs this pipeline? Try one integration and
[open an issue](https://github.com/gerefull/invokeport-mcp/issues)
with the client, tool and non-sensitive error details. Never paste keys or private payloads.

## Optional local STDIO connector

The npm connector exposes `search_capabilities`, `get_capability` and
`invoke_capability` rather than seven direct tools. It uses the same seven
first-party built-ins, policies and free execution API. It calls no LLM, uses
no browser cookies, and does not access paid or deferred external integrations.

### Install STDIO

Use Node >=22.5.0 and an MCP host that supports STDIO. Configure:

```json
{
  "mcpServers": {
    "invokeport": {
      "command": "npx",
      "args": ["-y", "invokeport-mcp@0.2.0"],
      "env": { "INVOKEPORT_ORIGIN": "https://invokeport.com" }
    }
  }
}
```

On Windows, hosts that require an executable may use `cmd` with arguments
`["/c", "npx", "-y", "invokeport-mcp@0.2.0"]`. Alternatively install the package
locally and launch Node with the absolute installed `server.mjs` path.
Search and schema retrieval work without a key.

To run tools, sign in at [InvokePort Keys](https://invokeport.com/dashboard/keys)
and create a limited key allowing the selected tool. Sign-in uses an off-chain
wallet message; free tools need no USDC or payment signature. Supply the key
privately through your MCP host's secret settings. Never include it in the
configuration committed to a repository.

### STDIO configuration

- `INVOKEPORT_ORIGIN`: explicit trusted origin, e.g. `http://127.0.0.1:3000`
  for local development. HTTP accepts only literal loopback; remote origins
  require HTTPS. No username, password, query, fragment or path is permitted.
- `INVOKEPORT_API_KEY`: optional for search/schema, required for invocation.
  Use an unexpired limited key with `tools:invoke`, a named
  policy, allowed tool IDs and a quota. Do not put the value in tool arguments,
  command-line flags, committed config, prompts or logs. This program does not
  read `.env` files or credential stores.

The public origin is `https://invokeport.com`; invocation requires a limited
key issued there. The connector never enables or calls paid tools even when
the site's paid marketplace is active.

### STDIO use

Task examples in 0.2.0:

- **JSON repair**: get `json-repair`, then call with `{"text":"{name:'Alpha',}"}`. Review repaired values; this cannot recover missing facts.
- **JSON to CSV**: get `json-csv`, then call with `{"rows":[{"name":"Alpha","count":2}]}`. Flat rows only; formula-like text is escaped and counted.
- **JSON to TypeScript**, **JSON Schema validation**, and **CSV to JSON** remain available under their existing IDs.

Try these tasks without an account at [JSON Repair](https://invokeport.com/tools/json-repair)
and [JSON to CSV](https://invokeport.com/tools/json-to-csv). Those pages compute locally;
headless MCP/API calls use the scoped key and quota described above.

Ask your agent to search for JSON tools, read `json-schema` with
`get_capability`, then invoke it with:

```json
{
  "tool": "json-schema",
  "input": { "schema": { "type": "integer", "minimum": 1 }, "value": 2 },
  "attemptId": "replace-with-a-fresh-uuid"
}
```

A successful call returns `valid: true`, `builtin: true`, `mode: "free-beta"`
and a request ID. Without a configured key, invocation returns
`missing_or_invalid_key` without sending a request.

### STDIO limits and verification

Run `npm install` and `npm test` in this standalone source repository. The InvokePort application's temporary-D1 integration suite is maintained separately. These connector tests make no production calls.

Search returns at most seven summaries. Get returns the selected schema/example.
Invoke takes `{tool,input,attemptId}`. The ID is not a credential: use a unique
16–128 character identifier per intended call. Reuse it only with exactly the
same input for manual reconciliation after an uncertain outcome. The server
never executes an already reserved attempt again and does not retain results.

Request JSON is limited to 128 KiB; HTTP responses to 512 KiB and 20 seconds;
MCP input buffering to 256 KiB. Results above 32 KiB are explicitly omitted,
with byte count/request ID, not silently truncated or fabricated. No local
payload files are created. Native network error details and credential echoes
are withheld. Redirects and paid states fail closed; resource URLs returned by
the API are never followed. The configured origin remains a trusted boundary.

The repository includes tests for STDIO → HTTP → temporary D1, the metadata
journal, replay protection, per-key quota, forbidden tools and revoked keys.
Local fixture success does not establish adoption or mainnet settlement.

Implementation follows the official [MCP server](https://ts.sdk.modelcontextprotocol.io/server)
and [MCP client](https://ts.sdk.modelcontextprotocol.io/client) v1 documentation,
using pinned SDK 1.30.0. No sampling capability or model API is configured.
