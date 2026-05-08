# Phase 6: Add blackbox MCP workflow tests and harden transport details

**Objective:** Catch real integration failures before deployment by proving a real MCP HTTP client can complete realistic authenticated workflows against the live `/mcp` endpoint.

**Why separate from implementation:** Transport bugs survive surprisingly often when tool handlers pass unit tests. This phase exists to catch request-lifecycle, connection, protocol, and serialization failures that only appear in blackbox flows.

## Developer context you need before touching code

- The current transport adapter in `projects/food-app/backend/src/mcp/http.ts` is still fragile: it creates one `StreamableHTTPServerTransport`, connects a shared `mcpServer` to it once, and routes all `GET /mcp` and `POST /mcp` traffic through that singleton transport.
- Earlier work on this project already exposed a transport-lifecycle failure mode around repeated `connect()` calls and stale/shared transport binding. Phase 6 must assume transport bugs are likely until blackbox tests prove otherwise.
- Existing MCP tests on this branch are minimal and split across `projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts` and `projects/food-app/backend/src/mcp/__tests__/login-tool.test.ts`. Those are a starting point, not a sufficient deployment gate.
- By the time this phase runs, Phase 4 and Phase 5 should already have added protected read and mutation tools. Phase 6 is where they get exercised as a real end-to-end MCP workflow instead of isolated per-tool checks.
- The agreed auth contract remains stateless: MCP login returns a JWT, and all protected tools take `auth.token` in tool inputs. If the blackbox client flow cannot reliably use that contract, treat it as a product bug, not a documentation issue.

## Constraints

- Keep these tests blackbox and client-driven. Prefer a real MCP HTTP client talking to the Express app over direct handler invocation.
- Do not bury transport assertions inside the per-tool unit tests. This phase should make transport failures obvious and attributable.
- Do not add fake test-only behavior to the runtime transport adapter just to make tests easier.
- Harden only the transport and protocol edges actually exercised by the workflow. Avoid speculative protocol abstraction.
- If a small operator smoke script is added, it should reuse the same endpoint and flow the tests exercise. Do not create a second unverifiable path.

## Files likely to change

- Create `projects/food-app/backend/src/mcp/__tests__/workflow.test.ts` or similarly named blackbox MCP workflow test file
- Possibly create `projects/food-app/backend/scripts/mcp-smoke.mjs`
- Modify `projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts`
- Modify `projects/food-app/backend/src/mcp/http.ts`
- Modify `projects/food-app/backend/package.json`
- Optionally modify `projects/food-app/backend/src/mcp/server.ts` only if transport hardening exposes registration/lifecycle coupling that must be simplified

## Recommended implementation shape

- Keep one focused transport canary suite that proves:
  - `initialize` succeeds,
  - `tools/list` succeeds,
  - sequential calls do not break session/transport state,
  - obvious protocol misuse fails cleanly.
- Add one realistic blackbox workflow suite that uses a real MCP HTTP client to perform:
  - connect / initialize,
  - `login`,
  - one authenticated read (`browse_dishes` or `view_menu`),
  - one authenticated mutation (`add_dish`, `update_menu`, or similar),
  - one follow-up read proving the mutation actually stuck.
- If the transport adapter needs hardening, keep the fix in `src/mcp/http.ts`, not spread across tests.
- If a smoke script is useful, make it operator-facing and boring: connect, login, call one read tool, print success/failure clearly, exit non-zero on failure.

## Work

- Expand the MCP blackbox coverage from transport smoke plus login into a full authenticated workflow.
- Verify content negotiation, request handling, and sequential request behavior through the real HTTP endpoint.
- Harden transport lifecycle details that the blackbox suite exposes: connection timing, reused/stale transport state, request routing, or response handling.
- Add a simple operator smoke script only if it materially improves manual verification outside Vitest.
- Keep failure messages specific enough that a broken run points to transport, auth, or tool/domain layers without archaeology.

## Tight feedback loop requirements

### Minimum scripts the developer should already have

From `projects/food-app/backend`:

- `npm test`
- `npm run test:mcp:http`
- `npm run build`

For this phase, the developer should also be able to run only the blackbox workflow test while iterating on transport bugs. Transport debugging is miserable if every rerun drags unrelated service suites with it.

### Minimum red/green loop for this phase

1. Write or extend the failing blackbox workflow test first.
2. Run only that test and confirm the failure is real.
3. Fix the smallest transport/protocol issue exposed.
4. Re-run the single workflow test until green.
5. Re-run the dedicated transport smoke test.
6. Re-run the full MCP test subset.
7. Run the full backend suite.
8. Run `npm run build`.
9. If useful, run the operator smoke script manually against the local backend.

### Commands the developer should be able to use

From `projects/food-app/backend`:

- `npx vitest run src/mcp/__tests__/workflow.test.ts`
- `npx vitest src/mcp/__tests__/workflow.test.ts`
- `npm run test:mcp:http`
- `npm test`
- `npm run build`
- `node scripts/mcp-smoke.mjs` if the smoke script is added

## What the tests must prove

### Transport smoke coverage

The transport-focused MCP tests should prove:

- `initialize` succeeds against `/mcp`,
- `tools/list` returns the registered tool set,
- sequential calls do not trip stale transport/server state,
- protocol/transport failures surface as transport-layer failures rather than mysterious domain errors.

### Full MCP workflow coverage

The blackbox workflow tests should prove:

- a real MCP HTTP client can connect and initialize,
- `login` returns a usable JWT,
- an authenticated read tool succeeds with that JWT,
- an authenticated mutation tool succeeds with that JWT,
- a follow-up read reflects the mutation,
- failure output is specific enough to distinguish auth failure from tool failure from transport failure.

### Optional operator smoke script

If added, the smoke script should prove that a human operator can validate endpoint health without opening Vitest internals:

- exit `0` on success,
- exit non-zero on failure,
- print which step failed (`initialize`, `login`, read tool, mutation tool).

## Deliverable

A realistic MCP end-to-end verification loop exists, and the transport layer is hardened enough that deployment regressions get caught before shipping.

## Must verify

- A real client can complete a full authenticated MCP workflow.
- Transport smoke coverage still passes.
- Failures point clearly to transport, auth, or tool/domain issues.
- `npm run build` still passes.
- Optional smoke script works if it exists.

## Failure smells to watch for

- Tests call tool handlers directly and claim transport is covered.
- The workflow succeeds only once per process and then flakes on sequential reruns.
- Transport fixes rely on test-only branches or environment flags.
- Workflow tests assert only that some text exists instead of validating the actual JSON contract.
- Operator smoke script drifts away from what the automated blackbox tests actually do.

## Deployment constraint: stateful transport

The current `StreamableHTTPServerTransport` stores session state in process memory. This means:

- Session IDs are stored in the backend process that created them.
- Repeated requests for one session **must** hit the same backend process.
- Non-sticky load balancing or proxy fan-out can produce `Bad Request: Server not initialized`, `Bad Request: Mcp-Session-Id header is required`, or `Session not found` errors.

**Acceptable operator fixes:**
- Sticky routing / affinity for `/mcp` traffic.
- Single backend instance for MCP traffic.
- Future redesign to stateless transport or shared session storage.

## Decision locked in

- MCP deployment safety depends on blackbox HTTP-client workflows, not only per-tool tests.
- Transport lifecycle bugs are first-class risks and deserve their own hardening phase.
- The transport adapter now handles `GET`, `POST`, and `DELETE /mcp` — the full Streamable HTTP method surface expected by MCP SDK clients.

---

## Appendix A: 2026-05-08 singleton transport diagnosis

The diagnosis in `projects/food-app/plans/mcp-server/2026-05-08_mcp-400-diagnosis.md` adds a second, more important failure mode beyond the previously fixed missing-DELETE bug.

What this appendix changes:
- A passing `DELETE /mcp` termination path is necessary but not sufficient.
- The current singleton `StreamableHTTPServerTransport` pattern can still fail even when all three HTTP methods exist.
- Phase 6 must now prove that two independent fresh clients can initialize successfully in sequence, and ideally concurrently, without one poisoning the other's lifecycle.

Additional verification now required:
- one client initializes, uses tools, and closes cleanly,
- a second new client can initialize after the first client lifecycle,
- repeated client runs do not require a backend restart,
- failure output stays obviously attributable to transport lifecycle rather than auth or tool logic.

If the blackbox suite only proves a single happy-path client, this phase is incomplete.
