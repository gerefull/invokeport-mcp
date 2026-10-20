import { randomUUID } from 'node:crypto';
import { connectorConfig, createApi, toolResult } from './client.mjs';

// Plain JavaScript HTTP example; no MCP host or LLM required.
try {
  const api = createApi(connectorConfig(process.env));
  const search = await api.search({ query: 'JSON Schema' });
  if (!search.capabilities.some(c => c.tool === 'json-schema')) throw new Error('tool_unavailable');
  const detail = await api.get('json-schema');
  const input = process.argv.includes('--invalid') ? {} : JSON.parse(detail.demoInput);
  const attemptId = randomUUID();
  const result = await toolResult(() => api.invoke({ tool: 'json-schema', input, attemptId }), attemptId);
  process.stdout.write(JSON.stringify(result.structuredContent) + '\n');
  if (result.isError) process.exitCode = 1;
} catch {
  process.stderr.write('Example failed before a confirmed result. Check local configuration and server availability.\n');
  process.exitCode = 1;
}
