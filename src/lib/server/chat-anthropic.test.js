import { test, expect } from 'vitest';
import { nativeAnthropicProvider } from '../../../scripts/chat-anthropic-provider.mjs';
/** @param {any[]} events */ const response = (events) =>
  new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join(''), {
    headers: { 'Content-Type': 'text/event-stream' }
  });
test('Anthropic streams text and assembled tool arguments with server-only key', async () => {
  /** @type {any} */ let posted;
  const provider = nativeAnthropicProvider(
    { provider: 'anthropic', model: 'explicit-claude-model', key: 'synthetic-dedicated-key' },
    async (url, options) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(new Headers(options?.headers).get('x-api-key')).toBe('synthetic-dedicated-key');
      posted = JSON.parse(String(options?.body));
      return response([
        { type: 'message_start' },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'tool-1', name: 'read_home', input: {} }
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{}' }
        },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
        { type: 'message_stop' }
      ]);
    }
  );
  const items = [];
  for await (const item of provider.stream([{ role: 'user', content: 'Question' }], {
    tools: [
      {
        name: 'read_home',
        description: 'Read home',
        parameters: { type: 'object', properties: {}, additionalProperties: false }
      }
    ]
  }))
    items.push(item);
  expect(items).toEqual([
    { type: 'text', text: 'Hello' },
    { type: 'tool', name: 'read_home', arguments: '{}', callId: 'tool-1' }
  ]);
  expect(posted.tools[0].input_schema.type).toBe('object');
  expect(JSON.stringify(posted)).not.toContain('synthetic-dedicated-key');
});
test('prior tool calls and results use Anthropic message blocks', async () => {
  /** @type {any} */ let posted;
  const provider = nativeAnthropicProvider(
    { provider: 'anthropic', model: 'explicit-claude-model', key: 'synthetic-key' },
    async (_url, options) => {
      posted = JSON.parse(String(options?.body));
      return response([
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
        { type: 'message_stop' }
      ]);
    }
  );
  for await (const item of provider.stream([
    { role: 'user', content: 'Question' },
    { type: 'function_call', name: 'read_home', arguments: '{}', call_id: 'tool-1' },
    { type: 'function_call_output', call_id: 'tool-1', output: '{"name":"Example"}' }
  ]))
    void item;
  expect(posted.messages[1]).toMatchObject({
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'tool-1', name: 'read_home', input: {} }]
  });
  expect(posted.messages[2]).toMatchObject({
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'tool-1' }]
  });
});
test('truncated or errored Anthropic streams cannot complete a reply', async () => {
  for (const events of [
    [{ type: 'error', error: { message: 'synthetic-key' } }],
    [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } }],
    [{ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }, { type: 'message_stop' }]
  ]) {
    const p = nativeAnthropicProvider(
      { provider: 'anthropic', model: 'explicit', key: 'synthetic-key' },
      async () => response(events)
    );
    await expect(
      (async () => {
        for await (const i of p.stream([])) void i;
      })()
    ).rejects.toThrow(/provider/i);
  }
});

test('valid typed-record arguments cross the provider boundary while read tools retain their small bound', async () => {
  const raw = JSON.stringify({
    text: '界'.repeat(1800),
    value: 'a'.repeat(500),
    field: 'a'.repeat(500),
    phone: 'a'.repeat(500),
    email: 'a'.repeat(500),
    sourceIds: []
  });
  async function collect(/** @type {string} */ name) {
    const provider = nativeAnthropicProvider(
      { provider: 'anthropic', model: 'explicit', key: 'synthetic-key' },
      async () =>
        response([
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'typed', name, input: {} }
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: raw }
          },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
          { type: 'message_stop' }
        ])
    );
    const out = [];
    for await (const item of provider.stream([])) out.push(item);
    return out;
  }
  expect((await collect('prepare_contact'))[0].arguments).toBe(raw);
  await expect(collect('read_source')).rejects.toThrow(/limit/i);
});

test('valid model patch arguments cross the provider boundary while read tools retain their small bound', async () => {
  const raw = JSON.stringify({
    note: '界'.repeat(1800),
    sourceIds: [],
    edits: [
      {
        target: 'opening',
        wallId: 'wall',
        openingId: 'door',
        field: 'widthFeet',
        expected: 3,
        value: 3.5
      }
    ]
  });
  async function collect(/** @type {string} */ name) {
    const provider = nativeAnthropicProvider(
      { provider: 'anthropic', model: 'explicit', key: 'synthetic-key' },
      async () =>
        response([
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'typed', name, input: {} }
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: raw }
          },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
          { type: 'message_stop' }
        ])
    );
    const out = [];
    for await (const item of provider.stream([])) out.push(item);
    return out;
  }
  expect((await collect('prepare_model_patch'))[0].arguments).toBe(raw);
  await expect(collect('read_source')).rejects.toThrow(/limit/i);
});
