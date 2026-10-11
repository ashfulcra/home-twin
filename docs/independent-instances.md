# Independent home instances

A household user needs Fulcra authentication, not a GitHub account. GitHub manages source; the Fulcra app starter also supports direct deployment. Each deployment must have its own project ID, canonical home root, harness annotation, workspace path and optional PUBLIC_APP_NAME. Clone only tracked generalized source; never copy another deployment's environment file, snapshot, private evidence, maintainer state or deployment metadata.

Start with an empty home record, the intended timezone and verified owner identity. Save originals and checksums in the private Fulcra workspace. New source-derived reconstruction can live in `home.reconstruction`, separately from `home.plan` rough rectangular drafts. It must remain `draft-needs-review` with source page/sheet provenance, feet coordinates, named floor IDs, nullable elevations and heights, and explicit limitations. The blueprint viewer illustrates each floor independently; its depth is not building height and it does not assert stacked floor elevations. Curves are sampled polygons, not silently converted to rectangles. Written dimensions and trace residuals remain private evidence alongside the model.

For a future transfer, prepare a private handoff manifest containing repository identity, baseline commit, deployment ID/domain, Fulcra workspace/home root, harness annotation, source checksums and unresolved questions. Repository transfer, Fulcra file ownership/access and deployment ownership are separate actions. Obtain the intended new account/recipient and specific sharing authorization; verify access under that account before changing existing ownership. A shared read permission is not proof of write access or completed ownership transfer. Never borrow the prior owner's credential.

Public examples and tests stay synthetic; actual plans and household facts belong in private storage. An optional local agent may process scans while the authenticated hosted app remains the household interface.

## Large architectural sources

Keep the complete original in the private Fulcra evidence folder and verify its checksum by readback. The hosted source uploader has a3MiB bounded attachment limit; do not silently raise it or label derived images as originals. A connected agent can inventory/render a large PDF locally, archive the complete original through Fulcra CLI, and publish bounded, checksum-linked page previews plus a reconstruction report for the dashboard. Preserve page numbers, sheet IDs, written dimensions, trace residuals and coordinate orientation. A successful original archive does not establish later periodic source-audit coverage for that large file; record that limitation explicitly.

## Maintaining an independent folder
Use the same explicit root for intake and guarded publication:

```sh
node scripts/home-maintainer.mjs cycle example-home /private/home-state --root /Example_Residence/twin --check-sources
node scripts/home-maintainer.mjs publish example-home /private/home-state --root /Example_Residence/twin
```
The state directory must remain outside the repository. Explicit project roots have one bounded folder name followed by `/twin`; traversal and nested arbitrary vault roots are rejected. Defaults still select `/shared/home-twin/HOME_ID`; existing `/home/twin` users retain `--legacy-root`. Source checks remain restricted to the selected home's `sources` folder. The authenticated maintainer and snapshot home ID must match. Resolve pending writes before changing roots or publishing fresh work. Oversized archived blueprints are not covered by the bounded 10 MiB periodic source audit; preserve their original checksum and separately record archive verification.

## Aligning blueprint floors
Page placement is not inter-floor registration. Before stacking floor geometry, preserve each sheet's scale/origin and establish common structural anchors or written offsets, recording the transform and residuals. Drawing-right/drawing-down orientation alone does not supply that relationship. If anchors are unresolved, keep room volumes in separate local frames; source-written elevations can remain evidence without implying shared horizontal positions. Roof cornice elevations do not establish roof membrane levels. A mixed fixed/sliding glazing assembly must not become a full-width passage merely because its plan tag starts with `D`. Preserve source versions when finer crops change an interpretation.
