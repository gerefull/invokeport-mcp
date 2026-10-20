import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Synthetic input; use only data you are authorized to send to your configured service.
export async function runWorkflow(client, observe = () => {}) {
  async function call(name, input) {
    const attemptId = randomUUID();
    observe({ stage: 'started', tool: name, attemptId });
    // Exactly one request. If it throws, retain attemptId; never automatically retry.
    const result = await client.callTool({ name, arguments: { input, attemptId } });
    const value = result.structuredContent;
    if (result.isError || !value || value.resultOmitted) throw new Error('workflow_call_failed_or_result_unavailable');
    observe({ stage: 'completed', tool: name, attemptId, requestId: value.requestId });
    return value;
  }
  const repaired = await call('invokeport_json_repair', { text: "[{name:'Alpha',count:2,},{name:'Beta',count:3,}]" });
  // In a real workflow review repair semantics; schema checks cannot recover missing facts.
  const checked = await call('invokeport_json_schema', {
    schema: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object',
      properties: { name: { type: 'string' }, count: { type: 'integer', minimum: 0 } },
      required: ['name', 'count'], additionalProperties: false } }, value: repaired.value,
  });
  if (checked.valid !== true) throw new Error('schema_validation_failed_export_not_attempted');
  const exported = await call('invokeport_json_csv', { rows: repaired.value });
  return { csv: exported.csv, rowCount: exported.rowCount, requestIds: [repaired.requestId, checked.requestId, exported.requestId] };
}

async function main() {
  const origin = new URL(process.env.INVOKEPORT_ORIGIN || 'https://invokeport.com');
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
      !(origin.origin === 'https://invokeport.com' || origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))) throw Error('untrusted_origin');
  const run = process.argv.includes('--run'), key = process.env.INVOKEPORT_API_KEY;
  if (run && !key) throw Error('configure_scoped_key_in_private_environment');
  const client = new Client({ name: 'invokeport-workflow-example', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('/api/mcp', origin), {
    requestInit: { headers: key ? { Authorization: `Bearer ${key}` } : {} },
    fetch: (url, options) => fetch(url, { ...options, redirect: 'error' }),
  });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    console.log(JSON.stringify({ server: client.getServerVersion(), tools: tools.map(t => t.name) }));
    if (run) console.log(JSON.stringify(await runWorkflow(client, event => console.log(JSON.stringify(event))), null, 2));
    else console.log('Discovery only. Set a private scoped key allowing json-repair, json-schema and json-csv, then use --run for three free calls.');
  } finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error('Workflow stopped. Check key scope, quota, supported input and the last attempt ID. No automatic retry was made.');
  process.exitCode = 1;
});

