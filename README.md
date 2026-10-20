# InvokePort MCP

An MCP server for [InvokePort](https://invokeport.com). It calls no LLM and exposes exactly
`search_capabilities`, `get_capability`, `invoke_capability`. Only the five
first-party built-ins are supported. No browser cookie, wallet or payment SDK
is used. Transport: local STDIO.

Supported IDs: `openapi-security`, `json-schema`, `csv-json`, `json-types`,
`webhook-check`. Existing keys do not automatically gain access to new IDs:
the owner must explicitly add them to a policy. Paid tools and deferred external
integrations remain unavailable through this free connector.

## Install

Use Node >=22.5.0 and an MCP host that supports STDIO. Configure:

```json
{
  "mcpServers": {
    "invokeport": {
      "command": "npx",
      "args": ["-y", "invokeport-mcp@0.1.0"],
      "env": { "INVOKEPORT_ORIGIN": "https://invokeport.com" }
    }
  }
}
```

On Windows, hosts that require an executable may use `cmd` with arguments
`["/c", "npx", "-y", "invokeport-mcp@0.1.0"]`. Alternatively install the package
locally and launch Node with the absolute installed `server.mjs` path.
Search and schema retrieval work without a key.

To run tools, sign in at [InvokePort Keys](https://invokeport.com/dashboard/keys)
and create a limited key allowing the selected tool. Sign-in uses an off-chain
wallet message; free tools need no USDC or payment signature. Supply the key
privately through your MCP host's secret settings. Never include it in the
configuration committed to a repository.

## Configuration

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

## Use

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

## Limits and verification

Run connector tests locally with `npm install` and `npm test`. They use synthetic data and loopback HTTP fixtures; no production secret is loaded.

Search returns at most five summaries. Get returns the selected schema/example.
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

The repository includes tests for MCP STDIO discovery, configuration validation, bounded responses and blocked paid tools. The InvokePort application separately verifies its D1 journal, replay protection, per-key quota and revoked keys. Local fixture success does not establish adoption or mainnet settlement.

Implementation follows the official [MCP server](https://ts.sdk.modelcontextprotocol.io/server)
and [MCP client](https://ts.sdk.modelcontextprotocol.io/client) v1 documentation,
using pinned SDK 1.30.0. No sampling capability or model API is configured.
