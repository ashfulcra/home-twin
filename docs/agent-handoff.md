# From home setup to a connected agent

A new home can be useful with no scan or measured floor plan. Complete guided setup, then open **Household → Download private agent brief**. The authenticated download contains an accepted snapshot of known equipment, source references, actual recorded service/provider information, unknowns and targeted capture questions. It is private household data; give it only to your intended agent.

The brief does not connect or launch an agent and contains no vendor credentials. Saved agent requests are separate from the brief. Use a long-running agent with Fulcra already connected to the intended account and the maintaining-home-twins skill installed alongside this repository. Tell it the home ID and provide the brief as data. The agent must recheck authenticated identity, membership, designated maintainer and current files; the brief is neither current authorization nor a complete contribution ledger.

The agent should start by reading the accepted home and sources, synchronizing current contributions, and choosing one useful gap. A label photo identifies a particular unit; an invoice can establish a service date/provider; an adjacency interview or rough plan can establish approximate room relationships. Ask one question at a time and continue unrelated useful work while captures are pending. Preserve original captures and source versions.

To create a brief locally from a downloaded accepted home or reconciled report:

```sh
node scripts/home-agent.mjs brief accepted-home.json new-private-brief.json
node scripts/home-agent.mjs brief reconciled-report.json another-private-brief.json
```

The helper writes mode0600, refuses to overwrite an existing file, performs no remote writes and labels role as unverified. It does not read environment secrets or borrow credentials. Offline references default to `/shared/home-twin/<home-id>/`; for a legacy home under `/home/twin`, inspect the actual private connection and correct the working references before use. Authenticated UI briefs resolve the actual current root.

Maintainers may publish accepted snapshots after current identity/version checks. Contributors create source-attributed contributions in their own account; viewers have no write role. Routine independent facts and notes can be projected; contradictions and major geometry remain review items. The brief intentionally uses the accepted snapshot only, so pending contributions must be synchronized separately.

No hardware or second household account is required to start this flow. Live device capture, reminder delivery and household sharing remain separate configured integrations.
