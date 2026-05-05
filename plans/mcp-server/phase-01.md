# Phase 1: Prove transport shape before deeper refactors

**Objective:** Validate the in-process MCP transport design early, before spending time on broad cleanup.

**Why first:** The highest-risk part is not CRUD logic. It is HTTP transport wiring, MCP lifecycle, and request handling.

## Developer context you need before touching code

- The backend lives in `projects/food-app/backend` and is a TypeScript Express app.
- Current entrypoint is `projects/food-app/backend/src/index.ts`; it creates the Express app and immediately calls `app.listen(...)`.
- Existing REST routes are mounted under `/api/auth`, `/api/dishes`, and `/api/menus`.
- There is no backend test harness yet in `projects/food-app/backend/package.json`; phase 1 is expected to introduce it.
- Existing E2E coverage lives in `projects/food-app/e2e` and already boots the backend with `PORT=3001 DB_PATH=./data/test.db ...` from the backend directory.
- The E2E database reset already points at `projects/food-app/e2e/global-setup.ts` -> `../backend/data/test.db`, so phase 1 should not invent a second test DB path.
- This phase is about proving the transport boundary, not implementing real food-app domain tools yet.

## Constraints

- Do not add MCP-to-REST loopback. MCP handlers must sit in-process.
- Do not add session-backed app auth in this phase.
- Do not broad-refactor dish/menu services yet unless transport proof absolutely requires a tiny extraction.
- Keep the first MCP tool trivial and deterministic so failures isolate transport problems rather than domain logic.

## Files likely to change

- Modify `projects/food-app/backend/package.json`
- Modify `projects/food-app/backend/package-lock.json`
- Create `projects/food-app/backend/vitest.config.ts`
- Create `projects/food-app/backend/src/test/setup.ts`
- Create `projects/food-app/backend/src/app.ts`
- Create `projects/food-app/backend/src/mcp/server.ts`
- Create `projects/food-app/backend/src/mcp/http.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts`
- Modify `projects/food-app/backend/src/index.ts`

## Recommended implementation shape

- Extract Express app construction into `projects/food-app/backend/src/app.ts` so tests can import the app without opening a real listener.
- Keep `projects/food-app/backend/src/index.ts` as the thin boot file that imports the app and calls `app.listen(...)`.
- Put MCP server definition and tool registration in `projects/food-app/backend/src/mcp/server.ts`.
- Put Express-to-MCP HTTP adaptation in `projects/food-app/backend/src/mcp/http.ts`.
- Mount `/mcp` from app construction time so the same app instance is used in tests and at runtime.

## Work

- Add backend test harness and MCP dependencies.
- Add explicit npm scripts for a tight backend feedback loop, not just one monolithic test command.
- Mount a minimal MCP server at `/mcp` in the existing Express app.
- Split responsibilities explicitly: server definition in `src/mcp/server.ts`, Express adapter in `src/mcp/http.ts`, app wiring in `src/app.ts`, process boot in `src/index.ts`.
- Implement the smallest possible live endpoint that can initialize correctly and expose at least one trivial tool such as `ping` or `health_echo`.
- Add a blackbox test using a real MCP HTTP client transport.
- Treat Phase 1 as incomplete unless `initialize`, `tools/list`, and one successful `tools/call` all succeed from the client side.

## Tight feedback loop requirements

### Backend scripts to add now

Add or update scripts in `projects/food-app/backend/package.json` so the implementer can iterate without guessing:

- `test`: run the full backend Vitest suite once.
- `test:watch`: run Vitest in watch mode for fast local iteration.
- `test:mcp:http`: run only the MCP HTTP smoke/integration tests.
- `test:mcp:http:watch`: run only MCP HTTP tests in watch mode.
- `build`: keep TypeScript compile as a separate fast structural check.

If naming differs slightly, preserve the intent: one full suite command, one focused MCP command, and watch-mode variants.

### Minimum red/green loop for this phase

1. Write a failing MCP HTTP smoke test.
2. Run only that test.
3. Make the smallest transport change.
4. Re-run only that test until green.
5. Run the focused MCP HTTP suite.
6. Run `npm run build`.
7. Run one existing UI regression slice only if app boot/wiring changed in a way that could affect the frontend entry path.

That loop is tight enough to catch transport mistakes fast without paying Playwright cost after every edit.

### Commands the developer should be able to use

From `projects/food-app/backend`:

- `npm run test:mcp:http`
- `npm run test:mcp:http:watch`
- `npm test`
- `npm run build`

From `projects/food-app/e2e` only when verifying no frontend boot regression:

- `npx playwright test tests/auth.spec.ts`

Use `tests/auth.spec.ts` as the default canary because it is cheaper than the broader dishes/menu flows and still proves the app boots and auth routing still works.

## What the smoke test must prove

The phase-1 smoke test should use a real MCP client transport and assert all of this:

- The HTTP endpoint is reachable on the mounted `/mcp` path.
- `initialize` succeeds and returns server metadata compatible with the SDK.
- `tools/list` succeeds and includes the expected trivial tool name.
- `tools/call` succeeds through the same transport path and returns deterministic structured content.
- Repeated calls in the same test process do not fail because of a bad singleton or stale transport binding.

That last check matters. A transport setup that only survives one request is not a real proof.

## Deliverable

The backend can serve a minimal MCP endpoint in-process and pass a real-client initialize, tool-list, and tool-call smoke test with a focused local test command.

## Must verify

- The endpoint boots in the main app.
- The MCP client can initialize successfully.
- `tools/list` succeeds from the real client and returns the expected minimal tool set.
- A real `tools/call` request can hit a trivial tool through the same HTTP path.
- At least two sequential client operations succeed in the same test run so no singleton-connect bug is hiding.
- `npm run build` still passes after the app/test wiring extraction.

## Failure smells to watch for

- Tests import `src/index.ts` and accidentally start a real listener.
- The smoke test uses mocked transport pieces and therefore proves nothing about HTTP wiring.
- The trivial tool depends on app auth or database state and turns a transport test into a domain test.
- Every verification step falls back to the full Playwright suite, making iteration slow enough that people stop running it.
- The MCP route only works for one request because the transport or server binding is reused incorrectly.

## Decision locked in

- Use MCP `initialize` as the boot-level canary for phase 1.
- Do not add a separate `GET /health` requirement in this phase.
