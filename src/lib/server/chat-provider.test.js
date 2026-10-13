import { test, expect } from 'vitest';
import { nativeResponsesProvider } from '../../../scripts/chat-model-provider.mjs';
const streamResponse = (/** @type {any[]} */ events) =>
  new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join(''), {
    headers: { 'Content-Type': 'text/event-stream' }
  });
test('provider requires explicit configuration and fixes official endpoint', () => {
  for (const c of [
    {},
    { provider: 'other', model: 'x', key: 'secret' },
    { provider: 'openai', model: 'x', key: '' }
  ])
    expect(() => nativeResponsesProvider(c)).toThrow(/configuration/i);
});
test('Responses SSE yields semantic text and complete function calls; key stays only in authorization', async () => {
  /** @type {any} */ let posted;
  const model = nativeResponsesProvider(
    { provider: 'openai', model: 'configured-model', key: 'dedicated-key' },
    async (url, options) => {
      expect(url).toBe('https://api.openai.com/v1/responses');
      posted = JSON.parse(String(options?.body));
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer dedicated-key');
      return streamResponse([
        { type: 'response.output_text.delta', delta: 'Hello' },
        {
          type: 'response.output_item.done',
          item: { type: 'function_call', name: 'read_home', arguments: '{}', call_id: 'call-1' }
        },
        { type: 'response.completed' }
      ]);
    }
  );
  const result = [];
  for await (const item of model.stream([{ role: 'user', content: 'Question' }], { tools: [] }))
    result.push(item);
  expect(result).toEqual([
    { type: 'text', text: 'Hello' },
    { type: 'tool', name: 'read_home', arguments: '{}', callId: 'call-1' }
  ]);
  expect(posted.store).toBe(false);
  expect(JSON.stringify(posted)).not.toContain('dedicated-key');
});
test('failed or cut-short provider stream never becomes a completed reply', async () => {
  for (const events of [
    [{ type: 'response.failed' }],
    [{ type: 'response.output_text.delta', delta: 'partial' }]
  ]) {
    const model = nativeResponsesProvider(
      { provider: 'openai', model: 'configured', key: 'secret' },
      async () => streamResponse(events)
    );
    await expect(
      (async () => {
        for await (const item of model.stream([])) void item;
      })()
    ).rejects.toThrow(/provider/i);
  }
});
test('Responses transport accepts CRLF-framed SSE', async () => {
  const model = nativeResponsesProvider(
    { provider: 'openai', model: 'configured', key: 'secret' },
    async () =>
      new Response(
        'data: {"type":"response.output_text.delta","delta":"Hi"}\r\n\r\ndata: {"type":"response.completed"}\r\n\r\n'
      )
  );
  const result = [];
  for await (const item of model.stream([])) result.push(item);
  expect(result).toEqual([{ type: 'text', text: 'Hi' }]);
});
