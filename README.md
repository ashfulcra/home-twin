# Home Twin

A Fulcra-authenticated home dashboard and agent workflow for reducing the work of owning a home. Start with equipment, contacts and care history, then refine a correctable floor plan. Exact dimensions are optional. All examples in this repository are synthetic. GitHub validation runs the locked install, tests, type checks and build without private credentials.

The UI supports private [source-file intake](docs/source-intake.md), guided setup, source-linked equipment and schedules, household contributions, conflict review, and an optional request for a connected home agent. A saved request does not launch an agent. Advanced chat and local captures/device integrations are separate add-ons.

Use [independent instances](docs/independent-instances.md) to create separate homes with their own deployment, private workspace and branding. Source-derived multi-floor polygon drafts can retain blueprint provenance without being reduced to rectangular room extents.

## Run locally

Use a Node version supported by the deployment platform (20, 22 or 24). Copy `.env.example` to `.env`, retain the official Fulcra authentication settings, then:

```sh
npm install
npm run dev
npm test
npm run check
npm run build
```

Private data loads through the signed-in user's Fulcra permissions; it is never bundled into the browser build. In a named existing-home deployment, login automatically submits an access request, a confirmed request share opens a pending page and the owner approves from Household without an agent. See [web joining](docs/web-joining.md). No GitHub account is required for household access. Only the generic starter without a named target offers **guided home setup** or manual household connection. Setup preserves existing records and saves questionnaire evidence without inventing service dates, providers or maintenance intervals.

For production use Fulcra's official [build-and-deploy-a-web-app skill](https://github.com/fulcradynamics/agent-skills/tree/main/skills/build-and-deploy-a-web-app). Configure the owner's UUID, harness annotation and private workspace before evaluating deployments. The owner-only harness shows real recorded runs and workspace evidence; it is not a static completion checklist.

## Connect a home agent

Open **Household → Download private agent brief** for known facts and targeted capture questions. Read [agent handoff](docs/agent-handoff.md) for a repeatable setup-to-agent flow.

Use [maintaining-home-twins](skills/maintaining-home-twins/SKILL.md) with a long-running agent connected to the intended Fulcra account. From the UI, save an agent request and give that agent the home ID. The agent reads the request, maintains a private workstream, preserves original captures, reconciles contributions and records blockers. It should ask for a targeted photo, scan, plan or measurement when that resolves a specific uncertainty; missing geometry does not block equipment or maintenance work.

Keep the full repository alongside the installed skill: copy `skills/maintaining-home-twins/` into your agent’s skills directory, and run its helper from this repository. The skill references this matching runtime; installing the guide alone does not install the application.

Data contracts and concrete Fulcra commands are linked from the skill. The local helper performs no remote writes:

```sh
node scripts/home-agent.mjs validate examples/home.json
node scripts/home-agent.mjs brief examples/home.json new-private-brief.json
node scripts/home-agent.mjs reconcile accepted.json incoming/ new-report.json
node scripts/home-agent.mjs sync HOME_ID new-authenticated-report.json
node scripts/home-agent.mjs review accepted.json incoming/ decisions.json new-candidate.json
```

`sync` uses the signed-in Fulcra CLI account, checks maintainer identity, reads only registered contributor folders, verifies source-account attribution and retains file IDs and hashes. It saves a local report and performs no remote writes. Unavailable contributor folders remain explicit. Offline JSON author fields alone are not authentication proof.

The report separates accepted routine changes from review items and refuses to overwrite an existing output. One designated maintainer reviews and publishes accepted snapshots, with version readback and handoff responsibility.

Care includes provider lookup, actual service dates, optional assigned chores and explicit recurring tasks. See [home care](docs/home-care.md) for date, completion and reminder behavior.

## Household collaboration

Read [shared homes](docs/shared-homes.md) and [contributions](docs/contributions.md). Each contributor uses their own Fulcra account. Only home-specific folders are shared; both an explicit Fulcra share and a member role are required. Contributors cannot rewrite the maintainer's snapshot. Source account attribution is checked, and contradictions or major geometry changes remain in review.

Collaboration is a pilot until a genuine two-account shared read/contribute/reconcile/revoke workflow has passed. Contract tests do not replace that live check. Revocation blocks future reads; it cannot recall previously downloaded information. Manual fact/geometry review-decision files are preserved: the local helper prepares reviewed fact candidates, while the UI does not publish those fact decisions automatically. Joining approvals use the separate owner dashboard workflow above.

The [rough layout editor](docs/layout-drafts.md) offers synthetic examples and an adjacency interview, with direct segment selection and freeform lengths. Estimated drafts stay correctable and require review before replacing an accepted model.

[Device observations](docs/device-feeds.md) use explicitly configured Fulcra sources and separate observation, bridge receipt, record and sync times. The optional read-only capture helper supports configured Home Assistant and PurpleAir endpoints; capture and publication are separate, and vendor credentials remain outside the web app.

## Architecture

Fulcra originals and immutable contributions → designated maintainer's accepted home record → regenerated dashboard projection. Every source keeps its origin and verification date. Import timestamps, service dates, device observations and sync times have different meanings.

New homes use `/shared/home-twin/<home-id>/`; this path is private until explicitly shared. The signed-in account keeps its own connection file under `/home/twin/`. Existing local home records can remain there until a deliberate, version-preserving migration. A connection does not grant access by itself.

## Public and private boundaries

Keep household exports, photos/scans, account IDs, credentials, private runtime logs and deployment evidence outside the repository. Do not turn a real home into a public demo. Use synthetic fixtures and environment configuration. The optional local agent should retain originals in Fulcra and keep device credentials server-side.

Based on the official Fulcra Svelte app template, including its Auth0 device flow and owner harness patterns. Fulcra brand assets remain associated with Fulcra; this repository does not grant rights beyond their original terms.

### Repeatable maintainer intake

Run `node scripts/home-maintainer.mjs cycle HOME_ID PRIVATE_STATE_DIR` from the full repository, using the intended signed-in Fulcra CLI account. The state directory must be outside this public repository and private to its owner. For an explicitly migrated legacy home, add `--legacy-root` to read `/home/twin`; otherwise the runtime reads `/shared/home-twin/HOME_ID`.

The cycle checks the current authenticated owner and named home before collecting registered contributions. It preserves immutable private reports, a current checkpoint, review items, unavailable-account blockers and targeted capture questions. Unchanged inputs produce no output. It performs no remote writes and does not install a watcher, launch an agent, grant access or send reminders. The connected agent calls it on each wake and continues useful unblocked work beyond the registered queue.

Process restart recovery preserves reports written before checkpoint interruption. A crashed writer may leave `.cycle.lock`; inspect whether the previous process is still running before removing an abandoned lock, then rerun the same command. Preserve reports and temporary files during inspection. Never clear a live lock or steal it after a timeout. Atomic publication is not a guarantee against disk failure or power loss.

### Guarded routine publication

After reviewing a cycle's private report, the designated connected maintainer can run `node scripts/home-maintainer.mjs publish HOME_ID PRIVATE_STATE_DIR` (add `--legacy-root` only for the migrated legacy layout). This is an explicit remote write. It publishes routine reconciled additions, retains held contradictions and geometry for review, preserves the previous snapshot under the home’s `history/`, and records an immutable private intent before writing.

The runtime uses one captured caller token, rechecks baseline and contributions after intake and immediately before sending snapshot bytes, and confirms the exact resulting record. A lost response remains pending; retry the same command and state directory to check that intent before preparing new work. Unchanged accepted snapshots are silent. Changed baseline/intake, collisions, missing intent or unavailable readback fail closed: preserve the intent and inspect the current record before superseding it. Never delete a pending intent just to get a successful run. This assumes one designated writer: Fulcra does not provide conditional snapshot writes here, so checks cannot guarantee atomicity against another simultaneous writer. Do not run competing maintainers or hand off while a write is unresolved.

### Targeted household captures

The Overview shows a few questions from the current home records and routine contributions, with more available on demand. Missing service dates, provider contacts and equipment details remain questions. A related-record shortcut preselects the equipment in Sources; the user still chooses and saves the original file. Shortcuts are scoped to their home and revision, and viewers cannot submit records. Questions are recomputed with current caller permissions on refresh; private maintainer journals are never exported into the UI.

### Portable schematic layout

Layout can show the same estimated room extents in 2D or a selectable 3D schematic. Quarter-turn rotations preserve orientation and room identity, with a north/east compass. The illustrated depth is for readability: it does not represent measured wall heights, openings or stairs. Incomplete room edits show a recoverable placeholder. Saving still creates a review draft; the view never replaces an accepted model.

### Find household knowledge

Find records searches the current home’s equipment facts, providers and their trades, service history and schedules. It shows recorded provider phone/email, actual completed service dates and source links. Search uses words rather than generating an answer; no result means no matching recorded evidence, not absence of the system or maintenance. Held review items and private maintainer journals are excluded.

### Inspection times and private execution receipts

Each successful maintainer cycle and separate owner inbox inspection stores a metadata-only receipt in the existing private state’s `inspection-receipts/` folder, including unchanged checks. Receipts link the retained report ID to its current supplied observation time and local persistence time, and retain source-access/discovery limits. They contain no source bodies or caller credentials. Original reports and unchanged checkpoints keep their historical bytes and timestamps; unchanged commands stay quiet.

A receipt proves local inspection persistence. It does not itself prove a scheduled trigger, authentication from offline input, complete source/inbox discovery, member delivery or approval. Check the receipt’s audit/discovery flags and the referenced report; aborted inspections, failed scope checks or occupied locks do not produce a successful receipt. Partial access or discovery stays explicit in the summary and referenced report. No receipt authorizes publication or access changes.

### Changes to original evidence

Opening an original checks its exact bytes against a recorded SHA-256. Changed or invalid recorded checksums return a conflict; they do not update accepted facts or the historical checksum. Legacy references without a checksum remain unverified, and uploaded originals retain their checksum and size checks. Reads always use the current caller’s permissions.

Add `--check-sources` to the maintainer `cycle` command to compare referenced Fulcra originals against their recorded checksums. Changed originals create private source-review work; absent checksums and inaccessible originals remain explicit. This is read-only and does not replace accepted facts. It checks at most 100 originals, streams at most 10 MiB per file, and uses the current caller’s permissions. New homes stay within their source folder; explicit legacy homes can reference their owner’s `home/` vault documents. Repeated unchanged audited cycles are silent. Use the flag consistently for a given monitoring flow. `publish` remains separate and does not accept this flag.


Continuous owner agents can inspect explicitly shared join requests without a browser using `node scripts/home-join-inbox.mjs inspect HOME_ID EXISTING_PRIVATE_MAINTAINER_STATE --root /PROJECT/twin` (or the configured `--legacy-root`). It reuses the current-owner app validation and existing private checkpoint/lock, keeps immutable private reports, stays silent when unchanged, and makes no remote changes. Run the source-audited maintainer cycle separately. See [owner agent discovery](docs/join-requests.md#owner-agent-discovery).
Existing reconstructed houses can be preserved as private, hash-verified offline review packages with the [assembly importer](docs/assembly-import.md). This retains original geometry and meshes without promoting new accepted home facts.
