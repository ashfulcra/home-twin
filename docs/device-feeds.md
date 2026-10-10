# Device observations through Fulcra

A local agent or authorized API connector captures device values and publishes a home-specific Fulcra moment annotation. The hosted app never stores vendor credentials or talks to household LAN devices. It reads only configured types using the signed-in user's token, validates the type against that account's current annotation catalog, and preserves source account scope. Sharing the home folder does not share observation data types; intended household recipients also need an explicit data-type share.

Current adapter: `MomentAnnotation/<UUID>` notes carrying `home-twin-observation/1`. It queries the configured freshness window plus one day (at least 24 hours), with a new read every 30 seconds while the Devices tab is open. Other native/v1 metric formats need a deliberately configured adapter; the app does not treat arbitrary annotations as device reports. No background capture job or device-control action is installed by the UI.

Observation example (all synthetic):

```json
{"schema":"home-twin-observation/1","id":"vendor-event-123","homeId":"example-home","equipmentId":"furnace","metric":"temperature","observedAt":"2026-01-01T12:00:00Z","receivedAt":"2026-01-01T12:00:02Z","value":70,"unit":"°F","availability":"online","synthetic":true}
```

`observedAt` is the device/source observation time. `receivedAt` is the bridge-reported arrival time. Fulcra `recorded_at` is displayed separately as record time; it is not claimed to be an independently measured device time or server ingestion timestamp. `syncedAt` is when the UI successfully read the feed. If a device supplies no observation time, leave it null: state stays unknown even after a successful sync. Never reset an old device timestamp to now to make it look live.

After catalog lookup and authorized selection, record with the CLI-connected account:

```sh
node scripts/publish-observation.mjs MomentAnnotation/TYPE_UUID observation.json
fulcra get-records MomentAnnotation/TYPE_UUID 1h
```

Retain source event ID, observation time and payload on uncertain retries. Repeated deliveries deduplicate by semantic event content even when receipt/record times differ; conflicting content for the same ID is flagged. Late arrivals never displace a newer observation. `offline`, `stale`, `unknown`, `conflict`, `no-data`, `unavailable` and `unconfigured` have separate meanings. A recent controller report is not proof of physical function.

The designated maintainer saves `feeds.json` in the home folder after validating source IDs and equipment placement:

```json
{"schemaVersion":1,"feeds":[{"id":"furnace-temperature","name":"Furnace temperature","dataType":"MomentAnnotation/TYPE_UUID","equipmentId":"furnace","metric":"temperature","freshnessSeconds":300}]}
```

Use an actual catalog UUID. Optional `sourceUserId` must be the owner or a registered contributor, with active Fulcra data sharing. Freshness is an explicit 30-second to 7-day policy, not a sensor guarantee. Writes and capture remain in the source account; the hosted reader never uses an owner's token for another household member. Link the equipment record to the room/model when its placement is known.

Physical feed setup needs available device access, exact identity and the API's timestamp/availability semantics. Preserve credentials privately and request physical tests for safety sensors. Missing access does not prevent using the home dashboard. Synthetic verification must stay isolated and labelled; never present it as household telemetry.

## Optional read-only capture helper

`node scripts/capture-device.mjs PRIVATE_CONFIG.json NEW_OBSERVATION.json` makes one configured GET and saves one private mode0600 observation. It never publishes, controls devices, follows redirects, creates jobs or overwrites an existing output. Publish the inspected file separately with `publish-observation.mjs`; uncertain publication retries reuse that saved file rather than recapturing.

A Home Assistant config names `kind: "home-assistant"`, `baseUrl` (origin only), `id` (stable configured source ID), `homeId`, `equipmentId`, `metric`, `entityId`, and `timestampField` (`last_reported` default, or explicitly `last_updated`). Supply its existing credential privately through `HOME_TWIN_HA_TOKEN` or a named `HOME_TWIN_` environment variable via `tokenEnv`. The helper issues only `GET /api/states/<entity_id>`. A token may have broader permissions than these reads; the helper does not create or expand account access. Local plain HTTP sends the credential to the configured origin; use only the intended trusted LAN endpoint or HTTPS.

Home Assistant `last_reported` means a controller entity report; `last_updated` means a state/attribute update. Neither independently proves a physical measurement or current device function. No fallback to receipt time or to another timestamp occurs when the configured field is absent. `unavailable` gives offline with null value; `unknown` stays unknown. See the official [REST API](https://developers.home-assistant.io/docs/api/rest/) and [state object](https://www.home-assistant.io/docs/configuration/state_object/).

For PurpleAir, use `kind: "purpleair"`, the same mapping IDs and origin, exact `sensorId` matching `SensorId`, selected `field` and explicit `unit`. The helper reads `/json`; it supports selected PM2.5 channel A/B ATM or CF1 values, AQI, temperature, humidity and pressure. It does not average channels, apply correction formulas or infer missing measurements. `DateTime` is the device clock, labelled separately from receipt. Raw SSID/location and unrelated fields are excluded. Older slash-form UTC dates are normalized; missing/invalid dates stay null. Field semantics follow PurpleAir's [sensor JSON documentation](https://community.purpleair.com/t/sensor-json-documentation/6917). Check the actual firmware and channel health before relying on a feed.

Stable capture IDs derive from configured source identity, source timestamp, selected value/unit and availability. Polling identical evidence retains the same ID. Response limits (64 KiB), timeout (10 seconds by default, configurable 100–30000 milliseconds), identity checks and HTTP failures are explicit. A failed fetch produces no observation; never turn a timeout into a fabricated offline device report. HTTP base origins cannot contain credentials or a query. Credentials are not included in observation output or failure body logs. Missing timestamps keep the dashboard state unknown, even if the request succeeded.
