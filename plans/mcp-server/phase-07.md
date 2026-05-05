# Phase 7: Hermes consumption check and rollout notes

**Objective:** Prove the endpoint is actually usable from Hermes and leave behind operational documentation that makes future setup obvious instead of archaeological.

**Why last:** This phase is the final reality check. The MCP server is not done just because tests pass locally; it is done when Hermes can consume it with the documented workflow a future operator would actually follow.

## Developer context you need before touching code

- This phase is explicitly documentation-plus-verification, not a hidden excuse to keep redesigning transport or tool contracts. If Hermes consumption fails here, feed the fix back into the earlier phase that owns the bug.
- `projects/food-app/README.md` exists and is the minimum obvious place to document the MCP endpoint. There is currently no `docs/` directory on this branch, so adding `projects/food-app/docs/mcp.md` is optional, not assumed.
- Hermes-side runtime config is operationally sensitive. Document the expected `mcp_servers` shape, but do not edit runtime config automatically.
- The agreed v1 auth model is two-layered:
  - optional server-level HTTP headers may exist at the Hermes MCP client config layer,
  - actual food-app application auth happens through MCP `login` and subsequent `auth.token` tool inputs.
- The rollout note should assume the user may validate via direct backend runs or a Playwright/Docker-assisted environment when local browser/tooling setup is annoying. Do not bury environment caveats.

## Constraints

- Do not modify Hermes runtime config files as part of this phase. Documentation and manual verification only.
- Keep docs minimal but sufficient. README bloat is bad, but missing setup details are worse.
- Do not restate generic MCP theory. Document only what is needed to connect Hermes to this specific food-app backend.
- Record caveats discovered during real Hermes consumption, especially auth-input expectations, endpoint path, or transport quirks.
- If Hermes consumption uncovers a bug, document the symptom briefly here and fix the owning earlier phase instead of patching around it in docs.

## Files likely to change

- Modify `projects/food-app/README.md`
- Optionally create `projects/food-app/docs/mcp.md`
- Optionally modify `projects/food-app/plans/mcp-server/plan.md` if a rollout caveat materially changes the top-level plan assumptions

## Recommended implementation shape

- Add a focused MCP section to `README.md` covering:
  - that the backend exposes `/mcp`,
  - the high-level tool set available in v1,
  - the fact that Hermes connects over MCP HTTP and then authenticates through the `login` tool.
- If the README starts getting noisy, move the step-by-step Hermes wiring details into `docs/mcp.md` and leave the README with a concise pointer.
- Document one minimal Hermes-side config example, but keep it illustrative rather than auto-applied. The key point is how to point Hermes at the food-app MCP endpoint, not to mutate local agent config.
- Document one canonical consumer flow:
  - connect to the MCP endpoint,
  - call `login`,
  - pass the returned JWT as `auth.token` to protected tools,
  - perform one read and one mutation.
- Include any practical caveats that matter in reality: port/path expectations, local-vs-container verification, or known error patterns if the backend is not started correctly.

## Work

- Validate one realistic Hermes consumption flow against the live MCP endpoint: `login` -> authenticated read -> authenticated mutation.
- Document the endpoint and operator workflow in `README.md`, and split into `docs/mcp.md` only if that makes the top-level README clearer.
- Document the expected Hermes `mcp_servers` config shape without editing runtime config.
- Note explicitly that food-app auth is tool-input based after `login`, even if server-level HTTP headers are available for generic MCP transport concerns.
- Record protocol or schema caveats discovered during the real consumption check.

## Tight feedback loop requirements

### Minimum verification loop for this phase

1. Start the backend in the same way an operator would.
2. Point a real MCP client at `/mcp`.
3. Verify `initialize` and `tools/list`.
4. Run the canonical Hermes flow: `login` -> protected read -> protected mutation.
5. Update docs immediately to match the verified flow.
6. Re-run the documented flow once more using the docs as written.

The docs are not done until they successfully drive the flow they describe.

### Commands or checks the developer should be able to perform

From the backend side:

- `npm run dev` or the equivalent production boot path
- any local MCP smoke command added in Phase 6

From the Hermes/operator side, verification should conceptually cover:

- connect Hermes to the `/mcp` endpoint,
- confirm tool discovery,
- call `login`,
- call one protected read tool,
- call one protected mutation tool.

Do not leave this phase at “the docs look plausible.”

## What the verification must prove

### Hermes consumption check

The real-consumer verification should prove:

- Hermes can discover the endpoint,
- Hermes can list the tools,
- Hermes can call `login` successfully,
- Hermes can pass the returned JWT through `auth.token` to protected tools,
- at least one end-to-end read/mutation flow works from the consumer perspective.

### Documentation quality

The docs should prove, by being usable, that a future operator can answer:

- what URL/path Hermes should target,
- whether any transport-level headers are needed,
- how food-app auth actually works,
- which tools exist in v1,
- how to validate the setup if something is broken.

### Caveat capture

This phase should also surface and record:

- any protocol quirks Hermes users need to know,
- any differences between transport auth and app auth,
- any local-environment gotchas relevant to verification.

## Deliverable

The MCP server is not just implemented and tested; it is proven consumable from Hermes, and the repo contains enough rollout notes that future setup does not require guesswork.

## Must verify

- Hermes can discover and use the endpoint.
- The documented login -> token -> protected-tool workflow actually works.
- Docs are enough for future setup without archaeology.
- Any real caveats found during Hermes consumption are recorded.

## Failure smells to watch for

- Docs describe a flow that was never actually re-run.
- README claims Hermes auth uses headers when the real app auth happens through `login` + `auth.token`.
- Verification is done with an internal test harness only, not a real consumer path.
- The phase patches over real product bugs with doc warnings instead of feeding fixes back to earlier phases.
- Setup instructions assume files or directories that do not exist in the repo.

## Decision locked in

- Hermes consumption is the final acceptance gate, not an optional nice-to-have.
- Runtime config remains a manual/operator concern; this phase documents it but does not mutate it.
