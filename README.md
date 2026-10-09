# Home Twin

A Fulcra-authenticated home dashboard and agent workflow for reducing the work of owning a home. Start with equipment, contacts and care history, then refine a correctable floor plan. Exact dimensions are optional. All examples in this repository are synthetic.

The UI supports guided setup, source-linked equipment and schedules, household contributions, conflict review, and an optional request for a connected home agent. A saved request does not launch an agent. Advanced chat and local captures/device integrations are separate add-ons.

## Run locally

Use a Node version supported by the deployment platform (20, 22 or 24). Copy `.env.example` to `.env`, retain the official Fulcra authentication settings, then:

```sh
npm install
npm run dev
npm test
npm run check
npm run build
```

Private data loads from the signed-in user's Fulcra account; it is never bundled into the browser build. New users can choose **guided home setup** or **join a household**. Setup preserves existing records and saves questionnaire evidence without inventing service dates, providers or maintenance intervals.

For production use Fulcra's official [build-and-deploy-a-web-app skill](https://github.com/fulcradynamics/agent-skills/tree/main/skills/build-and-deploy-a-web-app). Configure the owner's UUID, harness annotation and private workspace before evaluating deployments. The owner-only harness shows real recorded runs and workspace evidence; it is not a static completion checklist.

## Connect a home agent

Use [maintaining-home-twins](skills/maintaining-home-twins/SKILL.md) with a long-running agent connected to the intended Fulcra account. From the UI, save an agent request and give that agent the home ID. The agent reads the request, maintains a private workstream, preserves original captures, reconciles contributions and records blockers. It should ask for a targeted photo, scan, plan or measurement when that resolves a specific uncertainty; missing geometry does not block equipment or maintenance work.

Keep the full repository alongside the installed skill: copy `skills/maintaining-home-twins/` into your agent’s skills directory, and run its helper from this repository. The skill references this matching runtime; installing the guide alone does not install the application.

Data contracts and concrete Fulcra commands are linked from the skill. The local helper performs no remote writes:

```sh
node scripts/home-agent.mjs validate examples/home.json
node scripts/home-agent.mjs reconcile accepted.json incoming/ new-report.json
node scripts/home-agent.mjs sync HOME_ID new-authenticated-report.json
```

`sync` uses the signed-in Fulcra CLI account, checks maintainer identity, reads only registered contributor folders, verifies source-account attribution and retains file IDs and hashes. It saves a local report and performs no remote writes. Unavailable contributor folders remain explicit. Offline JSON author fields alone are not authentication proof.

The report separates accepted routine changes from review items and refuses to overwrite an existing output. One designated maintainer reviews and publishes accepted snapshots, with version readback and handoff responsibility.

Care includes provider lookup, actual service dates and optional assigned chores. See [home care](docs/home-care.md) for date, completion and reminder behavior.

## Household collaboration

Read [shared homes](docs/shared-homes.md) and [contributions](docs/contributions.md). Each contributor uses their own Fulcra account. Only home-specific folders are shared; both an explicit Fulcra share and a member role are required. Contributors cannot rewrite the maintainer's snapshot. Source account attribution is checked, and contradictions or major geometry changes remain in review.

Collaboration is a pilot until a genuine two-account shared read/contribute/reconcile/revoke workflow has passed. Contract tests do not replace that live check. Revocation blocks future reads; it cannot recall previously downloaded information. Manual review-decision files are preserved, but the current UI does not automatically apply those decisions.

The [rough layout editor](docs/layout-drafts.md) offers synthetic examples and an adjacency interview, with direct segment selection and freeform lengths. Estimated drafts stay correctable and require review before replacing an accepted model.

## Architecture

Fulcra originals and immutable contributions → designated maintainer's accepted home record → regenerated dashboard projection. Every source keeps its origin and verification date. Import timestamps, service dates, device observations and sync times have different meanings.

New homes use `/shared/home-twin/<home-id>/`; this path is private until explicitly shared. The signed-in account keeps its own connection file under `/home/twin/`. Existing local home records can remain there until a deliberate, version-preserving migration. A connection does not grant access by itself.

## Public and private boundaries

Keep household exports, photos/scans, account IDs, credentials, private runtime logs and deployment evidence outside the repository. Do not turn a real home into a public demo. Use synthetic fixtures and environment configuration. The optional local agent should retain originals in Fulcra and keep device credentials server-side.

Based on the official Fulcra Svelte app template, including its Auth0 device flow and owner harness patterns. Fulcra brand assets remain associated with Fulcra; this repository does not grant rights beyond their original terms.
