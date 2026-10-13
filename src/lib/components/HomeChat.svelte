<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { mergeRecordActions } from '$lib/home/chat-record-state.js';
  import { recordCard } from '$lib/home/chat-record-card.js';
  import { validateChatTurn } from '$lib/home/chat-contract.js';
  import { chatConversationReader } from '$lib/home/chat-poll-controller.js';
  import { uploadChatFile } from '$lib/home/chat-upload-client.js';
  import { validateChatUpload } from '$lib/home/chat-upload-contract.js';
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
  let recordActions: any[] = $state([]);
  let canSaveRecords = $state(false),
    savingId = $state('');
  let saveErrors: Record<string, string> = $state({});
  let viewport: HTMLElement | undefined = $state();
  let canUpload = $state(false),
    uploading = $state(false),
    uploadPercent = $state(0),
    uploadNotice = $state('');
  let uploadController: AbortController | undefined;
  let addedSources: any[] = $state([]);
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
  async function response(url: string, options: RequestInit = {}, writeOnly = false) {
    const r = await fetch(url, { cache: 'no-store', ...options });
    const value = await r.json();
    if (!r.ok) {
      if (r.status === 403 && writeOnly) {
        canSaveRecords = false;
        recordActions = [];
        void start();
      } else if (r.status === 401 || r.status === 403) {
        turns = [];
        events = [];
        recordActions = [];
        canSaveRecords = false;
        reader.select('');
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
      recordActions = mergeRecordActions(recordActions, value.actions ?? [], conversationId);
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
      canUpload = value.uploads === true;
      canSaveRecords = value.recordActions === true;
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
  async function saveRecord(action: any) {
    if (
      !canSaveRecords ||
      !available ||
      running ||
      savingId ||
      action.conversationId !== conversationId
    )
      return;
    const selected = conversationId,
      generation = reader.generation;
    savingId = action.actionId;
    saveErrors = { ...saveErrors, [action.actionId]: '' };
    try {
      const result = await response(
        '/api/home/chat/actions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: selected,
            actionId: action.actionId,
            digest: action.digest
          })
        },
        true
      );
      if (
        !disposed &&
        generation === reader.generation &&
        selected === conversationId &&
        result.actionId === action.actionId &&
        result.digest === action.digest &&
        result.conversationId === selected
      )
        recordActions = mergeRecordActions(
          recordActions,
          recordActions.map((a) => (a.actionId === action.actionId ? result : a)),
          selected
        );
    } catch {
      if (!disposed && generation === reader.generation && selected === conversationId && available)
        saveErrors = {
          ...saveErrors,
          [action.actionId]:
            'Saving could not be confirmed. Check this same record; its saved progress is retained.'
        };
    } finally {
      if (savingId === action.actionId) savingId = '';
      if (!disposed && generation === reader.generation) void refresh();
    }
  }
  async function send() {
    if (!available || running || uploading) return;
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
  async function addFile(event: Event) {
    const field = event.currentTarget as HTMLInputElement,
      file = field.files?.[0];
    if (!file || !canUpload || running || uploading) return;
    uploading = true;
    uploadPercent = 0;
    uploadNotice = 'Checking file…';
    uploadController = new AbortController();
    try {
      validateChatUpload({
        uploadId: crypto.randomUUID(),
        title: file.name,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        sha256: '0'.repeat(64)
      });
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
      )
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      uploadController.signal.throwIfAborted();
      const storageKey = key + ':upload:' + digest;
      let saved;
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      } catch {}
      const intent = validateChatUpload(
        saved ?? {
          uploadId: crypto.randomUUID(),
          title: file.name,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          sha256: digest
        }
      );
      const { chunkCount: unused, ...metadata } = intent;
      try {
        localStorage.setItem(storageKey, JSON.stringify(metadata));
      } catch {}
      uploadNotice = 'Uploading ' + file.name;
      const result = await uploadChatFile(
        file,
        metadata,
        (operation: string, input: any) =>
          response('/api/home/chat/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation, input })
          }),
        (p: number) => (uploadPercent = p),
        uploadController.signal
      );
      if (result.status === 'saved') {
        sourceId = result.sourceId;
        if (!addedSources.some((s) => s.id === sourceId))
          addedSources.push({ id: sourceId, title: file.name });
        uploadNotice = file.name + ' is saved and attached.';
      } else
        uploadNotice =
          'Your file is awaiting confirmation. Select this same file again to check it.';
    } catch (e) {
      uploadNotice = uploadController.signal.aborted
        ? 'Upload paused. Select the same file to resume.'
        : e instanceof Error
          ? e.message
          : 'Couldn’t confirm this file. Select it again to resume.';
    } finally {
      uploading = false;
      field.value = '';
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
    if (savingId || running) return;
    recordActions = [];
    saveErrors = {};
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
    <button onclick={newConversation} disabled={!ready || running || !!savingId}
      >New conversation</button
    >
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
      {#each recordActions.filter((a) => a.turnId === turn.input.turnId) as action (action.actionId)}
        {@const card = recordCard(action.draft, {
          ...home,
          sources: [...(home.sources ?? []), ...addedSources]
        })}
        <article class="record-card" aria-label="Proposed home record">
          <h3>{card.title}</h3>
          <dl>
            {#each card.rows as row}<div>
                <dt>{row[0]}</dt>
                <dd>{row[1]}</dd>
              </div>{/each}
          </dl>
          {#if action.status === 'accepted'}<p role="status">Saved to this home.</p>
          {:else if action.status === 'submitted'}<p role="status">
              Submitted for the home’s next update.
            </p>
          {:else if action.status === 'held-for-review'}<p role="status">
              This record needs review before it can update the home.
            </p>
          {:else if action.status === 'publication-pending' || action.status === 'pending-readback'}<p
              role="status"
            >
              Saving is awaiting confirmation.
            </p>{/if}
          {#if canSaveRecords && !['accepted', 'submitted', 'held-for-review'].includes(action.status)}
            <button
              type="button"
              onclick={() => saveRecord(action)}
              disabled={!available || running || !!savingId}
            >
              {savingId === action.actionId
                ? 'Saving…'
                : action.status === 'proposed' && !saveErrors[action.actionId]
                  ? 'Save record'
                  : 'Check saved progress'}
            </button>
          {/if}
          {#if saveErrors[action.actionId] && !['accepted', 'submitted', 'held-for-review'].includes(action.status)}<p
              role="alert"
            >
              {saveErrors[action.actionId]}
            </p>{/if}
        </article>
      {/each}
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
          ><option value="">No record selected</option
          >{#each [...(home.sources ?? []), ...addedSources.filter((s) => !home.sources?.some((h: any) => h.id === s.id))] as source}<option
              value={source.id}>{source.title ?? source.id}</option
            >{/each}</select
        ></label
      >
      {#if canUpload}<label class="file-button"
          >Add a file<input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
            onchange={addFile}
            disabled={!available || running || uploading || !!pending}
          /></label
        >{/if}
      <div>
        {#if running}<button type="button" onclick={stop}>Stop reply</button>{:else}<button
            class="send"
            disabled={!available || uploading || (!message.trim() && !sourceId)}
            type="submit">{pending ? 'Retry message' : 'Send'}</button
          >{/if}
      </div>
    </div>
  </form>
  {#if uploading}<p role="status">
      {uploadNotice} · {uploadPercent}%
      <button onclick={() => uploadController?.abort()}>Pause upload</button>
    </p>{:else if uploadNotice}<p role="status" class="notice">{uploadNotice}</p>{/if}
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
  .record-card {
    border: 1px solid #bdd3c6;
    border-radius: 12px;
    padding: 16px;
    margin: 12px 0;
    overflow-wrap: anywhere;
  }
  .record-card h3 {
    margin: 0 0 12px;
    font-size: 18px;
  }
  .record-card dl {
    margin: 0 0 16px;
  }
  .record-card dl div {
    margin: 8px 0;
  }
  .record-card dt {
    font-size: 12px;
    color: #63756d;
  }
  .record-card dd {
    margin: 3px 0 0;
    white-space: pre-wrap;
  }
  .record-card p {
    font-size: 14px;
  }
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
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .file-button input {
    display: block;
    max-width: 220px;
    margin-top: 5px;
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
    .record-card {
      border: 1px solid #bdd3c6;
      border-radius: 12px;
      padding: 16px;
      margin: 12px 0;
      overflow-wrap: anywhere;
    }
    .record-card h3 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    .record-card dl {
      margin: 0 0 16px;
    }
    .record-card dl div {
      margin: 8px 0;
    }
    .record-card dt {
      font-size: 12px;
      color: #63756d;
    }
    .record-card dd {
      margin: 3px 0 0;
      white-space: pre-wrap;
    }
    .record-card p {
      font-size: 14px;
    }
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
