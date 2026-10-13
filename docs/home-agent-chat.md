# Embedded home agent chat

The authenticated Chat tab relays the current Fulcra caller to a persistent worker. The worker rechecks current home membership on each operation and tool read. It does not borrow the owner's token. The current release reads home records, searches knowledge, reads checksum-verified text and bounded image/PDF pages and inspects model components by ID. Contributors and maintainers can add original evidence through the chat file picker. Accepted fact writes and geometry changes are a separate stage; this runtime does not grant access, send messages or control devices.

Messages have stable conversation and turn IDs. Durable private journals prevent repeated inference on a retry; browser disconnect leaves the job running, while Stop cancels it. Restart marks interrupted runs and never restarts them automatically. Transcript copies are immutable, private to their author's own Fulcra account under `/home-twin-chat/HOME/conversations/CONVERSATION/`. An uncertain upload is reconciled by exact readback and never blindly uploaded again.

Configure the worker with a private file (permissions0600) and private directories (0700):

```json
{
  "key": "a-separate-random-relay-secret-of-at-least-forty-characters",
  "directory": "/private/home-chat/runtime",
  "port": 6194,
  "homes": [
    {
      "homeId": "example",
      "ownerUserId": "33333333-3333-4333-8333-333333333333",
      "root": "/Example/twin",
      "model": {
        "provider": "anthropic",
        "model": "claude-sonnet-5-5",
        "keyFile": "/private/home-chat/secrets/anthropic-key.txt"
      }
    }
  ]
}
```

Each home's model and private key file are configured separately. No key is inherited by another home. Supported transports are Anthropic Messages and OpenAI Responses; the latter requires provider `openai` and its explicit model ID. Configuration/status checks never make an inference request. API credentials remain in worker memory and private credential files, never in conversation journals, provider prompts, public source, UI status or browser storage.

Run `node scripts/home-chat-service.mjs /private/home-chat/config.json` as a supervised ordinary backend. It binds loopback exclusively. Expose it through an authenticated HTTPS relay. Set the web deployment's private `HOME_CHAT_SERVICE_URL` and `HOME_CHAT_SERVICE_KEY` to that relay and its separate secret; never place the provider key in web build configuration. The service requires both its relay secret and the current Fulcra caller's token. `/health` reveals readiness only.

The optional model field may be absent until an owner provisions it. The Chat screen then reports that its model connection is not configured. Supplying a key does not establish that billing or inference works: verify a bounded actual streamed reply, then an authenticated current-home conversation, refresh, Stop and exact Fulcra transcript readback. Fixture tests and the synthetic UI simulation are not live-provider evidence.

Limits: 8KiB input, six existing source IDs, bounded recent context, six model rounds,16tool calls,64KiB output,100turns per conversation, eight concurrent jobs and a120second provider timeout. Originals require exact checksums and current access. The file picker accepts PNG/JPEG/WebP/PDF/UTF-8 text up to200MiB in3MiB resumable chunks. Browser storage retains only stable upload metadata, never file bytes. Selecting the same original resumes missing chunks; Pause preserves existing chunks. Unconfirmed cloud writes only reconcile exact readback. Originals and immutable evidence contributions are stored in the caller’s account; uploading does not accept facts, grant original access or publish a new house model. Read-only users can ask questions but cannot upload.

Native PDF/image extraction requires Python3 with PyMuPDF and Pillow on the supervised worker’s PATH. It reads up to four selected numbered pages at a time, preserving page counts and explicit partial coverage, with1568px image bounds,45second timeout and at most two processors. Full originals remain unchanged in Fulcra. PDF batches can be requested by source ID; passwords, unsupported formats, pages beyond600 and invalid images are explicit processing errors. Private upload capacity defaults to2GiB across stable jobs and one original finalization at a time. Reaching capacity preserves originals and requires maintainer inspection; no automatic deletion.

Coordination uses native Node SQLite transactions as process locks (Node22.13or later). A process crash releases ownership automatically; no live lock is expired, deleted or stolen. Historical unverified legacy `.lock` files remain explicit recovery blockers. Nonterminal event limits reserve room for completion, Stop and interrupted recovery; older full journals retain history while closing their active turn.
