<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { validateChatTurn } from '$lib/home/chat-contract.js';
  import { chatConversationReader } from '$lib/home/chat-poll-controller.js';
  let { home } = $props<{ home: any }>();
  let ready = $state(false),
    available = $state(false),
    sending = $state(false),
    checking = $state(false),
    errorMessage = $state(''),
    message = $state(''),
    sourceId = $state(''),
    conversationId = $state(''),
    storage = $state('local');
  let turns: any[] = $state([]),
    events: any[] = $state([]),
    pending: any = $state(null),
    callerId = '';
  let viewport: HTMLElement | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let key = '';
  const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'uncertain']);
  let running = $derived(sending || turns.some((t) => !terminal.has(t.status)));
  const toolLabels: Record<string, string> = {
    read_home: 'Reading home records',
    search_records: 'Finding records',
    read_source: 'Reading the original',
    read_model_region: 'Checking the home model'
  };
  function remember() {
    try {
      localStorage.setItem(key, conversationId);
    } catch {
      /* Server conversation remains authoritative. */
    }
  }
  async function response(url: string, options: RequestInit = {}) {
    const r = await fetch(url, { cache: 'no-store', ...options });
    const value = await r.json();
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        turns = [];
        events = [];
        available = false;
      }
      throw new Error(value.message ?? 'Chat is temporarily unavailable.');
    }
    return value;
  }
  const reader = chatConversationReader(response);
  async function refresh() {
    if (disposed || checking || !conversationId) return;
    checking = true;
    const generation = reader.generation;
    try {
      const cursor = events.at(-1)?.cursor ?? 0;
      const value = await reader.poll(cursor);
      if (!value || disposed) return;
      turns = value.turns;
      for (const item of value.events) {
        if (!events.some((e) => e.cursor === item.cursor)) events.push(item);
      }
      storage = value.storage?.state ?? 'local';
      if (pending && turns.some((t) => t.input.turnId === pending.turnId)) {
        pending = null;
        message = '';
        sourceId = '';
      }
      errorMessage = '';
      await tick();
      if (viewport && running) viewport.scrollTop = viewport.scrollHeight;
    } catch (e) {
      if (generation === reader.generation && !disposed)
        errorMessage = e instanceof Error ? e.message : 'Couldn’t reconnect to chat.';
    } finally {
      if (generation !== reader.generation) return;
      checking = false;
      if (!disposed) timer = setTimeout(refresh, running ? 800 : 4000);
    }
  }
  async function start() {
    try {
      const value = await response('/api/home/chat');
      callerId = value.callerId;
      if (value.homeId !== home.id || typeof callerId !== 'string')
        throw new Error('Your chat account could not be confirmed.');
      key = 'home-chat:' + home.id + ':' + callerId;
      available = value.available === true;
      try {
        conversationId = localStorage.getItem(key) ?? '';
      } catch {}
      if (!/^[a-f0-9-]{36}$/i.test(conversationId)) {
        conversationId = crypto.randomUUID();
        remember();
      }
      reader.select(conversationId);
      checking = false;
      ready = true;
      void refresh();
    } catch (e) {
      ready = true;
      errorMessage = e instanceof Error ? e.message : 'Chat is temporarily unavailable.';
    }
  }
  async function send() {
    if (!available || running) return;
    try {
      pending ??= validateChatTurn({
        conversationId,
        turnId: crypto.randomUUID(),
        message,
        attachmentIds: sourceId ? [sourceId] : []
      });
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Add a message.';
      return;
    }
    sending = true;
    errorMessage = '';
    try {
      await response('/api/home/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending)
      });
      if (timer) clearTimeout(timer);
      void refresh();
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Message could not be confirmed. Retry it.';
    } finally {
      sending = false;
    }
  }
  async function stop() {
    try {
      await response('/api/home/chat/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId })
      });
      if (timer) clearTimeout(timer);
      void refresh();
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Couldn’t stop this reply.';
    }
  }
  function newConversation() {
    if (running) return;
    conversationId = crypto.randomUUID();
    reader.select(conversationId);
    checking = false;
    turns = [];
    events = [];
    pending = null;
    message = '';
    sourceId = '';
    storage = 'local';
    remember();
    errorMessage = '';
    if (timer) clearTimeout(timer);
    void refresh();
  }
  onMount(() => {
    void start();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  });
</script>

<section class="house-chat" aria-label="House agent chat">
  <header>
    <div>
      <h2>Ask your home</h2>
      <p>Questions, records and the details that keep this home remembered.</p>
    </div>
    <button onclick={newConversation} disabled={!ready || running}>New conversation</button>
  </header>
  {#if !ready}<p role="status">Opening chat…</p>{:else if !available && !errorMessage}<p
      role="status"
    >
      Chat will be ready when this home’s model connection is configured.
    </p>{/if}
  <div class="conversation" bind:this={viewport} aria-label="Conversation">
    {#if !turns.length}<div class="welcome">
        <h3>What would you like to know?</h3>
        <p>Ask about equipment, maintenance, records or the home model.</p>
      </div>{/if}
    {#each turns as turn (turn.input.turnId)}
      {@const turnEvents = events.filter((e) => e.turnId === turn.input.turnId)}
      <article class="question">
        <p class="speaker">You</p>
        <p>{turn.input.message}</p>
        {#if turn.input.attachmentIds?.length}<p class="attached">
            {turn.input.attachmentIds.length} attached home record{turn.input.attachmentIds
              .length === 1
              ? ''
              : 's'}
          </p>{/if}
      </article>
      <article class="answer">
        <p class="speaker">Home agent</p>
        <div class="reply">
          {turnEvents
            .filter((e) => e.type === 'text')
            .map((e) => e.data.text)
            .join('')}
        </div>
        {#if !terminal.has(turn.status)}{@const tool = turnEvents
            .filter((e) => e.type === 'tool')
            .at(-1)}
          <p class="working" role="status">
            {tool?.data.status === 'running'
              ? (toolLabels[tool.data.name] ?? 'Working with home records')
              : 'Thinking…'}
          </p>
        {:else if turn.status === 'cancelled'}<p class="working">
            Reply stopped.
          </p>{:else if turn.status === 'interrupted' || turn.status === 'uncertain'}<p
            class="working"
          >
            This reply was interrupted. It wasn’t restarted automatically.
          </p>{:else if turn.status === 'failed'}<p class="working">
            This reply couldn’t finish. You can try a new message.
          </p>{/if}
      </article>
    {/each}
  </div>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void send();
    }}
  >
    <label class="message-label" for="house-chat-message">Message</label><textarea
      id="house-chat-message"
      bind:value={message}
      disabled={!available || running || !!pending}
      maxlength="8000"
      rows="3"
      placeholder="Ask about this home…"
      onkeydown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          void send();
        }
      }}
    ></textarea>
    <div class="composer-actions">
      <label
        >Attach a home record <select
          bind:value={sourceId}
          disabled={!available || running || !!pending}
          ><option value="">No record selected</option>{#each home.sources ?? [] as source}<option
              value={source.id}>{source.title ?? source.id}</option
            >{/each}</select
        ></label
      >
      <div>
        {#if running}<button type="button" onclick={stop}>Stop reply</button>{:else}<button
            class="send"
            disabled={!available || (!message.trim() && !sourceId)}
            type="submit">{pending ? 'Retry message' : 'Send'}</button
          >{/if}
      </div>
    </div>
  </form>
  {#if errorMessage}<p class="notice" role="alert">
      {errorMessage}
      <button
        onclick={() => {
          if (available) void refresh();
          else void start();
        }}>Reconnect</button
      >
    </p>{/if}
  {#if turns.length && storage === 'unconfirmed'}<p class="notice" role="status">
      Your conversation is retained here. Its Fulcra copy is awaiting confirmation.
    </p>{/if}
  <p class="privacy">
    This conversation is private to your account. The agent uses your current access to this home.
  </p>
</section>

<style>
  .house-chat {
    max-width: 1000px;
    margin: auto;
    background: #fff;
    border: 1px solid #d3dfd9;
    border-radius: 18px;
    padding: 24px;
    color: #202c2c;
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: start;
  }
  h2 {
    font-size: 28px;
    margin: 0;
  }
  header p,
  .privacy {
    color: #63756d;
    font-size: 14px;
    line-height: 1.5;
  }
  button {
    background: white;
    color: #254a3c;
    border: 1px solid #bdd3c6;
    border-radius: 10px;
    padding: 11px 16px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .conversation {
    height: clamp(300px, 48vh, 660px);
    overflow: auto;
    overscroll-behavior: contain;
    padding: 18px 0;
  }
  .welcome {
    padding: 35px 12px;
    color: #64766e;
  }
  .welcome h3 {
    font-size: 23px;
    color: #284239;
  }
  .question {
    margin: 15px 0 15px auto;
    max-width: 85%;
    background: #eff6f2;
    border-radius: 14px;
    padding: 15px 20px;
  }
  .question p,
  .reply {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.6;
    margin: 0;
  }
  .speaker {
    font-size: 12px;
    font-weight: 700;
    color: #5b7065;
    margin-bottom: 7px !important;
  }
  .answer {
    padding: 15px 10px;
    margin: 15px 0;
  }
  .attached,
  .working {
    font-size: 13px;
    color: #687b70;
  }
  .working {
    margin: 8px 0;
  }
  form {
    border-top: 1px solid #e1e8e4;
    padding-top: 16px;
  }
  .message-label {
    font-size: 14px;
    display: block;
    margin-bottom: 7px;
  }
  textarea {
    resize: vertical;
    width: 100%;
    min-height: 82px;
    background: white;
    border: 1px solid #bbcec3;
    border-radius: 12px;
    padding: 13px;
    font: inherit;
    color: #202c2c;
    box-sizing: border-box;
  }
  textarea:focus,
  select:focus {
    outline: 2px solid #73a18a;
    outline-offset: 2px;
  }
  .composer-actions {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 15px;
    margin-top: 10px;
  }
  .composer-actions label {
    font-size: 12px;
    color: #63756d;
  }
  .composer-actions select {
    display: block;
    margin-top: 5px;
    border: 1px solid #c5d6cc;
    border-radius: 8px;
    padding: 8px;
    max-width: 330px;
    background: white;
    color: #284239;
  }
  .send {
    background: #254a3c;
    color: white;
  }
  .notice {
    color: #685836;
    line-height: 1.6;
    font-size: 14px;
  }
  .privacy {
    margin-bottom: 0;
  }
  @media (max-width: 600px) {
    .house-chat {
      padding: 16px;
    }
    header {
      display: block;
    }
    header button {
      margin-bottom: 10px;
    }
    .conversation {
      height: 45vh;
    }
    .question {
      max-width: 95%;
    }
    .composer-actions select {
      max-width: 220px;
    }
    h2 {
      font-size: 25px;
    }
  }
</style>
