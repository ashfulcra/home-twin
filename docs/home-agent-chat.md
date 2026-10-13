# Embedded home agent chat

The authenticated Chat tab relays the current Fulcra caller to a persistent worker. The worker rechecks current home membership on each operation and tool read. It does not borrow the owner's token. The current release reads home records, searches knowledge, reads checksum-verified text originals and inspects model components by ID. Evidence uploads, accepted fact writes and geometry changes are a separate stage; this runtime does not grant access, send messages or control devices.

Messages have stable conversation and turn IDs. Durable private journals prevent repeated inference on a retry; browser disconnect leaves the job running, while Stop cancels it. Restart marks interrupted runs and never restarts them automatically. Transcript copies are immutable, private to their author's own Fulcra account under `/home-twin-chat/HOME/conversations/CONVERSATION/`. An uncertain upload is reconciled by exact readback and never blindly uploaded again.

Configure the worker with a private file (permissions0600) and private directories (0700):

```json
{
  "key": "a-separate-random-relay-secret-of-at-least-forty-characters",
  "directory": "/private/home-chat/runtime",
  "port": 6194,
  "homes": [{
    "homeId": "example",
    "ownerUserId": "33333333-3333-4333-8333-333333333333",
    "root": "/Example/twin",
    "model": {
      "provider": "anthropic",
      "model": "claude-sonnet-5-5",
      "keyFile": "/private/home-chat/secrets/anthropic-key.txt"
    }
  }]
}
```

Each home's model and private key file are configured separately. No key is inherited by another home. Supported transports are Anthropic Messages and OpenAI Responses; the latter requires provider `openai` and its explicit model ID. Configuration/status checks never make an inference request. API credentials remain in worker memory and private credential files, never in conversation journals, provider prompts, public source, UI status or browser storage.

Run `node scripts/home-chat-service.mjs /private/home-chat/config.json` as a supervised ordinary backend. It binds loopback exclusively. Expose it through an authenticated HTTPS relay. Set the web deployment's private `HOME_CHAT_SERVICE_URL` and `HOME_CHAT_SERVICE_KEY` to that relay and its separate secret; never place the provider key in web build configuration. The service requires both its relay secret and the current Fulcra caller's token. `/health` reveals readiness only.

The optional model field may be absent until an owner provisions it. The Chat screen then reports that its model connection is not configured. Supplying a key does not establish that billing or inference works: verify a bounded actual streamed reply, then an authenticated current-home conversation, refresh, Stop and exact Fulcra transcript readback. Fixture tests and the synthetic UI simulation are not live-provider evidence.

Limits: 8KiB input, six existing source IDs, bounded recent context, six model rounds,16tool calls,64KiB output,100turns per conversation, eight concurrent jobs and a120second provider timeout. Text originals require an accepted checksum and bounded access; images/PDFs and large source processing remain the next evidence stage.
