import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { connectorConfig, createApi, toolResult, TOOL_IDS } from '../client.mjs';

const key = 'synthetic-local-test-key-only';
const config = { origin: 'http://127.0.0.1:12345', key };
const detail = { mode: 'free-beta', capability: { serviceRoutingKey: 'builtin', routingKey: 'json-schema',
  priceAtomic: '0', invocation: { mode: 'platform-builtin' }, inputSchema: '{"type":"object"}', demoInput: '{}' } };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('new free tools use the same fixed route and policy checks; paid and external tools stay closed', async () => {
  assert.deepEqual(TOOL_IDS, ['openapi-security','json-schema','csv-json','json-types','webhook-check','json-repair','json-csv']);
  for (const tool of ['json-types','webhook-check','json-repair','json-csv']) {
    let posts=0;
    const api=createApi(config, async (url,init)=> {
      if (init.method === 'GET') return response({ ...detail, capability: { ...detail.capability, routingKey:tool } });
      posts++; assert.equal(url,config.origin + '/api/tools/' + tool);
      return response({mode:'free-beta',builtin:true,valid:true});
    });
    assert.equal((await api.invoke({tool,input:{},attemptId:'expanded-tool-attempt-0001'})).valid,true);
    assert.equal(posts,1);
    for (const forbidden of ['data-cleaner','search-agent-context']) await assert.rejects(api.get(forbidden),/tool_not_supported/);
  }
});

test('configuration requires explicit origin; rejects malformed keys, URL credentials and non-loopback HTTP', () => {
  assert.deepEqual(connectorConfig({ INVOKEPORT_ORIGIN: config.origin, INVOKEPORT_API_KEY: key }), config);
  for (const origin of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/?key=a', 'https://example.com/path']) {
    assert.throws(() => connectorConfig({ INVOKEPORT_ORIGIN: origin, INVOKEPORT_API_KEY: key }), /invalid_origin/);
  }
  assert.deepEqual(connectorConfig({ INVOKEPORT_ORIGIN: config.origin }), { origin: config.origin, key: undefined });
  assert.throws(() => connectorConfig({ INVOKEPORT_ORIGIN: config.origin, INVOKEPORT_API_KEY: '' }), /missing_or_invalid_key/);
});

test('keyless discovery reads the public schema but invocation cannot send any HTTP request', async () => {
  let calls = 0;
  const api = createApi(connectorConfig({ INVOKEPORT_ORIGIN: config.origin }), async (_url, options) => {
    calls++;
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.authorization, undefined);
    return response(detail);
  });
  assert.equal((await api.get('json-schema')).tool, 'json-schema');
  assert.equal(calls, 1);
  const result = await toolResult(() => api.invoke({ tool: 'json-schema',
    input: { schema: { type: 'integer' }, value: 2 }, attemptId: 'no-key-attempt-0001' }));
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, 'missing_or_invalid_key');
  assert.equal(calls, 1);
});

test('paid mode, redirects and credential echoes stop before POST', async () => {
  for (const [make, error] of [
    [() => response({ error: 'payment_required' }, 402), 'PAID_DISABLED'],
    [() => response({ ...detail, mode: 'real-payments' }), 'PAID_DISABLED'],
    [() => new Response('', { status: 302, headers: { location: 'https://elsewhere.invalid' } }), 'redirect_rejected'],
    [() => response({ ...detail, echo: key }), 'credential_echo_rejected'],
  ]) {
    let calls = 0;
    const api = createApi(config, async (_url, options) => { calls++; assert.equal(options.method, 'GET'); return make(); });
    const result = await toolResult(() => api.invoke({ tool: 'json-schema', input: {}, attemptId: 'test-attempt-0001' }));
    assert.equal(result.structuredContent.error, error); assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes(key));
  }
});

test('unknown network result is not retried and never leaks native error text', async () => {
  let posts = 0;
  const api = createApi(config, async (_url, options) => {
    if (options.method === 'GET') return response(detail);
    posts++; throw new Error(`secret ${key}`);
  });
  const result = await toolResult(() => api.invoke({ tool: 'json-schema', input: {}, attemptId: 'test-attempt-0001' }), 'test-attempt-0001');
  assert.equal(posts, 1); assert.equal(result.structuredContent.error, 'network_or_response_unknown');
  assert.equal(result.structuredContent.attemptId, 'test-attempt-0001'); assert.ok(!JSON.stringify(result).includes(key));
});

test('response bytes and model output are bounded without invented results', async () => {
  const api = createApi(config, async () => new Response('x'.repeat(512 * 1024 + 1)));
  assert.equal((await toolResult(() => api.get('json-schema'))).structuredContent.error, 'response_too_large');
  const result = await toolResult(async () => ({ requestId: 'test', value: 'x'.repeat(40000) }));
  assert.equal(result.structuredContent.truncated, true); assert.equal(result.structuredContent.value, undefined);
  assert.ok(JSON.stringify(result).length < 2000);
});

test('official MCP client negotiates STDIO and calls all three tools without ambient author session', async () => {
  let posts = 0;
  const http = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/api/catalog?')) {
      assert.equal(req.headers.authorization, undefined);
      res.end(JSON.stringify({ mode: 'free-beta', capabilities: [detail.capability], pagination: { total: 1 } })); return;
    }
    if (req.url === '/api/catalog/builtin/json-schema') { res.end(JSON.stringify(detail)); return; }
    assert.equal(req.url, '/api/tools/json-schema'); assert.equal(req.headers.authorization, `Bearer ${key}`);
    assert.equal(req.headers['idempotency-key'], 'stdio-test-attempt-01');
    let input = ''; for await (const chunk of req) input += chunk;
    assert.deepEqual(JSON.parse(input), { value: 2 }); posts++;
    res.end(JSON.stringify({ mode: 'free-beta', valid: true, builtin: true, requestId: '12345678-1234-1234-1234-123456789abc' }));
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../server.mjs', import.meta.url))], stderr: 'pipe',
    env: { INVOKEPORT_ORIGIN: `http://127.0.0.1:${http.address().port}`, INVOKEPORT_API_KEY: key } });
  const client = new Client({ name: 'isolated-test-client', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert.match(client.getInstructions(), /JSON repair/);
    assert.match((await client.listTools()).tools[0].description, /JSON to TypeScript/);
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['search_capabilities', 'get_capability', 'invoke_capability']);
    const search = await client.callTool({ name: 'search_capabilities', arguments: {} });
    assert.equal(search.structuredContent.capabilities.length, 1);
    assert.equal(search.structuredContent.capabilities[0].inputSchema, undefined);
    const get = await client.callTool({ name: 'get_capability', arguments: { tool: 'json-schema' } });
    assert.equal(get.structuredContent.inputSchema, '{"type":"object"}');
    const result = await client.callTool({ name: 'invoke_capability', arguments: {
      tool: 'json-schema', input: { value: 2 }, attemptId: 'stdio-test-attempt-01' } });
    assert.equal(result.structuredContent.valid, true); assert.equal(posts, 1);
  } finally { await client.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); }
});
