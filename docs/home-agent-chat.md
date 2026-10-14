# Optional house-agent chat

Use this guide after the home and its authenticated hosted app are set up. Chat is optional; the basic Home Twin skill does not require a model key or worker. For a separate home, start with [independent instances](independent-instances.md). This guide does not create a home, transfer an account or grant access.

The hosted Chat tab sends the current signed-in Fulcra caller to one persistent worker. Model keys stay on that worker. Each operation checks the caller’s current home access; nobody borrows the owner’s token.

## Choose the capabilities

Start with accepted home records and geometry read-only. Enable each additional capability explicitly for its intended home:

| Capability | Worker configuration | Who can use it |
|---|---|---|
| Chat, accepted-source reading and original file upload | Model configured; no action flags needed | Current members can read; contributors/maintainers can explicitly upload |
| Prepare supported records and Save | `recordActions: true`, existing `maintainerDirectory` | Contributors save their own contributions; designated owner publishes routine accepted additions |
| Save an uploaded file as accepted source evidence | `sourceActions: true` plus record actions and the same state | Current designated owner |
| Prepare geometry and open Preview | `modelReviews: true` | Contributors/maintainers; preparation does not apply edits |
| Apply a reviewed model change and Review undo | `modelActions: true` plus model reviews, record actions and the same state | Current designated owner, exact Preview/Apply decision |

Uploading preserves the original and evidence identity; it does not accept a fact or change geometry. The model can prepare proposals, but cannot click Save or Apply. Contradictions and major geometry remain review work. Undo creates a separate inverse proposal requiring its own Preview/Apply.

## Prepare the environment

Use the complete matching repository, Node22.13 or later, and Python3 with PyMuPDF/Pillow available on the supervised worker’s PATH. Install the tested file-processing dependencies in its intended Python environment:

```sh
python3 -m pip install -r scripts/requirements-chat-files.txt
```

Verify the home ID, current owner UUID and canonical root from the intended deployment and authenticated account. The examples below use synthetic `example`, `33333333-3333-4333-8333-333333333333` and `/Example/twin`; replace them with verified values. The existing canonical `home.json` must already exist and match that home/owner. Do not copy another household’s environment, originals, snapshot or state to set up a new one.

Keep worker configuration and model credential files outside repositories, mode0600; private directories are mode0700. Provision a separate random relay secret of at least40characters and a separate provider key per home. A key file contains only its key. Choose a model ID available to that provider account; `YOUR_MODEL_ID` and `GENERATE_A_SEPARATE_RELAY_SECRET_AT_LEAST_40_CHARACTERS` below are placeholders. Never print keys, put them in prompts or command arguments, or store provider keys in the web deployment.

## Initialize state only for a genuinely new home

For a verified new home that has never had a designated maintainer, run the read-only audited cycle before enabling action flags:

```sh
node scripts/home-maintainer.mjs cycle example /private/example/maintainer-state --root /Example/twin --check-sources
```

This command creates the new private state and scoped checkpoint while checking the actual signed-in owner, accepted snapshot and originals. It does not publish or schedule anything. Inspect its private report, scope/checkpoint and any access/review blockers; a directory existing by itself is not verified maintainer state. Retain all generated history and intents. Use this exact directory and root for chat actions and later cycles/publications.

For a previously maintained home, use its existing directory. If it is missing, stop action setup and recover the original state from the verified volume/backup; do not run fresh initialization or `mkdir` to replace lost history. A fresh cycle cannot prove that old uncertain writes are resolved. Preserve live locks and reconcile existing pending publication, admission or household-refresh intents by exact readback before fresh work. If recovery is unavailable, record that blocker and resume prerequisite. This guide provides no reset/recovery override. Chat can remain without action flags while recovery is pending, if its separate valid configuration/runtime remains available.

For an explicitly verified legacy `/home/twin` root, use `--legacy-root` instead of `--root`. The flags cannot be combined. See the skill’s [Fulcra workflow](../skills/maintaining-home-twins/references/fulcra-workflow.md) for audited reports, guarded publication and maintainer handoff.

## Configure the worker

The default example permits conversation and explicit role-authorized uploads while leaving accepted-record/model actions disabled:

```json
{
  "key": "GENERATE_A_SEPARATE_RELAY_SECRET_AT_LEAST_40_CHARACTERS",
  "directory": "/private/example/chat/runtime",
  "port": 6194,
  "homes": [
    {
      "homeId": "example",
      "ownerUserId": "33333333-3333-4333-8333-333333333333",
      "root": "/Example/twin",
      "model": {
        "provider": "anthropic",
        "model": "YOUR_MODEL_ID",
        "keyFile": "/private/example/secrets/anthropic-key.txt"
      }
    }
  ]
}
```

For an owner who explicitly wants the complete action interface, use this home entry **after** the initialization/recovery checks above. Retain the same outer relay/runtime configuration:

```json
{
  "homeId": "example",
  "ownerUserId": "33333333-3333-4333-8333-333333333333",
  "root": "/Example/twin",
  "maintainerDirectory": "/private/example/maintainer-state",
  "recordActions": true,
  "sourceActions": true,
  "modelReviews": true,
  "modelActions": true,
  "model": {
    "provider": "anthropic",
    "model": "YOUR_MODEL_ID",
    "keyFile": "/private/example/secrets/anthropic-key.txt"
  }
}
```

One home has one designated maintainer. Action setup requires an existing private, nonsymlinked designated state directory. Source actions pin its identity and hold if it disappears or is replaced after startup; do not change directories to evade a hold. Keep each home’s state, runtime and key separate. Supported model transports are Anthropic Messages and OpenAI Responses; OpenAI requires `provider: "openai"` and an explicitly chosen model/key file. No global model/key fallback is inherited by other homes. The model entry may be absent until provisioned; the interface then reports that chat is unconfigured.

## Connect the hosted app

Run the existing worker as a supervised ordinary backend:

```sh
node scripts/home-chat-service.mjs /private/example/chat/config.json
```

It binds only loopback. Provision the intended authenticated HTTPS relay reachable by the hosted app; relay hosting and service supervision are environment-specific prerequisites, not commands supplied here. The worker requires both its relay secret and the current caller’s Fulcra token. `/health` reports readiness, not idle status or successful inference.

For a named existing-home app, its private settings must target the same verified home:

```text
HOME_MODE=existing
HOME_ID=example
HOME_OWNER_USER_ID=33333333-3333-4333-8333-333333333333
HOME_ROOT=/Example/twin
PUBLIC_APP_NAME=Example home
HOME_CHAT_SERVICE_URL=<intended authenticated HTTPS relay URL>
HOME_CHAT_SERVICE_KEY=<same separate relay secret>
```

`HOME_MODE=existing` means the app targets the already-created record. Preserve that app’s other intended project, harness and authentication settings; follow the official Fulcra app starter for deployment. Provider keys belong only in the worker’s private credential file, never web/build settings or browser storage. API credentials remain out of transcripts, tool output and UI status. No new agent/bus listener, schedule, share or recipient is needed to expose Chat.

## Verify the intended live interface

Configuration and synthetic tests do not prove provider billing, deployed access or publication. Under the intended current account:

1. Verify one bounded streamed reply, refresh the same conversation, use Stop, and confirm the author’s exact private Fulcra transcript readback.
2. Upload a supported original; verify its unchanged checksum, source/contribution identity and provider response. A viewer must remain unable to upload or write.
3. If enabled, review and Save one supported source-linked routine record. A contributor confirms its submitted receipt; acceptance still requires the designated maintainer. Under the designated owner, confirm the native accepted receipt and reload. For owner source-only admission, use **Save file to home records**; never invent a fact just to admit a file.
4. If model actions are intended, verify exact Preview/Apply/Review undo behavior with synthetic geometry first. Actual home edits require supported evidence and the exact current owner decision. Source admission advances the home revision: prepare a fresh proposal afterward, rather than rebasing an old approval.

Record actual versus synthetic results and concrete access/evidence blockers. Owner readback does not prove that a second household account can read; that account’s own fresh verification remains separate. Chat grants no access, sends no household messages and controls no devices.

## Recovery and operating bounds

For evidence rechecks and private handoff preparation, use [source versions and coverage](source-version-audits.md). Exact checksum/version provenance does not accept a fact, verify physical geometry or grant recipient access.

Stable conversation/turn/upload/request IDs preserve retries. Browser disconnect keeps a job running; Stop cancels subsequent work. Restart marks interrupted turns without automatically restarting them. Before restarting an existing worker, verify terminal turn journals, no active record/model/source jobs, no live lock and coherent native publication state. Readiness alone is not idle proof.

A lost Save reply retains its exact request and offers **Continue verification**. Uncertain native/cloud writes use exact readback, not a second publication. Only an authoritative inactive unsaved or terminal-held source request offers **Review file again**; a new review needs a new Save. Accepted home refresh preserves the composer/conversation. Originals, prior source versions, construction overrides, immutable decisions and contribution IDs remain intact.

Conversations have private author-account transcripts under `/home-twin-chat/HOME/conversations/CONVERSATION/`. Journals are outside repositories,0700/0600. Record-action storage allows30 action conversations per actor and100 proposals per conversation; model-review storage allows30 conversations per actor and50 total logical proposals; source reviews allow50 per home/owner. These are separate action-store bounds, not an ordinary-chat conversation limit. Complete fsynced staged files can recover identical bytes; partial/conflicting state holds. Native SQLite process coordination releases ownership on crash; unverified legacy lock files remain recovery blockers. Never expire, delete or steal a live lock.

Limits:8KiB input, six source IDs, six model rounds,16tool calls,64KiB output,100turns/conversation, eight concurrent jobs and120second provider timeout. PNG/JPEG/WebP/PDF/UTF-8 text uploads allow200MiB originals in3MiB resumable chunks; metadata-only browser resume retains no original bytes. Private upload capacity defaults to2GiB, with one finalization at a time and no automatic deletion. Extraction reads up to four numbered PDF pages per request, at most600pages,1568px image bounds,45second timeout and two processors; partial coverage is explicit. Periodic maintainer source audit is separately bounded to100sources/10MiB per original; large-file archive/readback is not proof of later full audit coverage. Missing, revoked, changed or unsupported originals are explicit holds, not unchanged evidence.
