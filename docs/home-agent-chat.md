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

Native PDF/image extraction requires Python3 with PyMuPDF and Pillow on the supervised worker’s PATH. Install the tested versions with `python3 -m pip install -r scripts/requirements-chat-files.txt` in the worker’s Python environment; CI creates its own virtual environment with that same requirements file. It reads up to four selected numbered pages at a time, preserving page counts and explicit partial coverage, with1568px image bounds,45second timeout and at most two processors. Full originals remain unchanged in Fulcra. PDF batches can be requested by source ID; passwords, unsupported formats, pages beyond600 and invalid images are explicit processing errors. Private upload capacity defaults to2GiB across stable jobs and one original finalization at a time. Reaching capacity preserves originals and requires maintainer inspection; no automatic deletion.

Coordination uses native Node SQLite transactions as process locks (Node22.13or later). A process crash releases ownership automatically; no live lock is expired, deleted or stolen. Historical unverified legacy `.lock` files remain explicit recovery blockers. Nonterminal event limits reserve room for completion, Stop and interrupted recovery; older full journals retain history while closing their active turn.

Model review foundation: `scripts/chat-model-patches.mjs` provides private `prepare`, `list` and exact-digest read-only `preview` methods. The authenticated worker can expose it per home with `modelReviews: true`; this is opt-in and has no approve, apply, publication or rollback method. Preparation verifies selected originals and current contributor/maintainer authority, freezes the full home/file-version/model digests and stores only the bounded edits, source receipts and numeric changes. The preview supplies affected wall plan coordinates and before/after elevation dimensions; it rejects stale versions and malformed identities. Raw reconstruction metadata, overrides and originals are never replaced by normalized display data. Source status explicitly describes preparation-time verification; future publication must check the originals again.

Keep each journal outside the repository in private0700 directories/0600 files. Retention is bounded to30 conversations and50 logical proposals per home/caller. Empty reads allocate nothing. Each immutable proposal has a stable identity and an exclusive, fsynced private staging file. A complete interrupted stage can be recovered with the same digest; a partial stage holds that action while other valid reviews remain readable. At most one bounded stage and one final file exist for each logical proposal. No model geometry is promoted by these methods. Chat shows the proposed dimensions and an exact read-only plan/elevation preview. Geometry publication still requires an exact owner decision and a separately guarded native publication/rollback workflow.

The optional model review tool can discover current component IDs with paginated `list_model_components` and inspect them with `read_model_region` before preparing a bounded correction. The worker exposes private model review receipts separately from record actions, and the authenticated `/api/home/chat/model-preview` route only reads the exact saved digest under the current caller. Stale or lost-access previews are removed from the interface. Previewing never saves geometry.
