# Phase 4: Implement read tools first

**Objective:** Deliver the safest useful MCP functionality before mutations by exposing authenticated read access to dishes and menus through the new service boundary.

**Why fourth:** Read tools prove the service extraction is usable from MCP before adding writes, and they keep the first real domain-facing MCP surface low-risk.

## Developer context you need before touching code

- Phase 1 already proved transport with `ping`, and Phase 2 already added `login`. Phase 4 should build on that existing MCP shape instead of inventing a second registration pattern.
- Current MCP files on this branch are still minimal: `projects/food-app/backend/src/mcp/server.ts`, `projects/food-app/backend/src/mcp/http.ts`, `projects/food-app/backend/src/mcp/tools/login.ts`, and tests under `projects/food-app/backend/src/mcp/__tests__/`.
- `projects/food-app/backend/src/mcp/server.ts` currently registers tools directly via `mcpServer.tool(...)` plus `registerLoginTool(mcpServer)`. If Phase 4 introduces `tools/index.ts`, keep the registration flow boring and consistent.
- The agreed auth contract is stateless and tool-input based: protected tools require `auth.token`, and token verification should reuse `projects/food-app/backend/src/services/auth.ts`.
- The agreed v1 tool names are agent-facing, not REST-shaped: `browse_dishes` and `view_menu`, not `getDishes` or `GET /api/menus/:date` wrappers.
- `projects/food-app/e2e/tests/dishes.spec.ts` and `projects/food-app/e2e/tests/menu.spec.ts` exist and are the narrow UI canaries for this phase after backend checks are green.

## Constraints

- Do not add mutation behavior in this phase. That belongs to Phase 5.
- Do not bypass the service layer. Read tools must call shared dishes/menu services, not route handlers and not duplicated SQL.
- Do not smuggle auth through HTTP headers or MCP session state. Protected read tools validate `auth.token` from tool arguments.
- Keep tool outputs deterministic JSON objects that are easy for an agent to consume. Avoid prose-heavy responses.
- Do not mirror REST payloads blindly if agent-facing input can be narrower. For reads, the simplest valid input is usually the right one.
- Keep transport/protocol assertions separate from domain-tool assertions. `http-smoke.test.ts` should stay a transport canary, not become a kitchen-sink domain suite.

## Files likely to change

- Create `projects/food-app/backend/src/mcp/schemas.ts`
- Create `projects/food-app/backend/src/mcp/tools/browse-dishes.ts`
- Create `projects/food-app/backend/src/mcp/tools/view-menu.ts`
- Create `projects/food-app/backend/src/mcp/tools/index.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/browse-dishes.test.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/view-menu.test.ts`
- Modify `projects/food-app/backend/src/mcp/server.ts`
- Optionally modify `projects/food-app/backend/package.json` if focused MCP read-tool test scripts materially improve iteration speed

## Recommended implementation shape

- Introduce shared MCP-side input schemas in `src/mcp/schemas.ts` only if they actually remove duplication. Keep them small:
  - an `auth` object schema with `token`,
  - a date-bearing schema for `view_menu` if needed.
- Implement `browse_dishes` as a protected tool that:
  - validates `auth.token`,
  - calls the dishes service list/read function,
  - returns a JSON object containing `dishes` in the current domain shape.
- Implement `view_menu` as a protected tool that:
  - validates `auth.token`,
  - accepts the target date explicitly,
  - calls the menus service read function,
  - returns the same domain-level `{ date, entries }` shape the backend already exposes.
- Use a small registration helper layer only if it keeps `server.ts` simpler. If `tools/index.ts` becomes an abstraction tax, skip it.
- Keep auth verification near the tool boundary so the service layer stays domain-only.

## Work

- Write focused MCP tests for `browse_dishes` and `view_menu` before implementing the tools.
- Add any minimal MCP schemas needed for protected-tool input reuse.
- Implement `browse_dishes` against the dishes service.
- Implement `view_menu` against the menus service.
- Register both tools in the MCP server.
- Verify the tools through a real MCP HTTP client, not by calling handlers directly only.

## Tight feedback loop requirements

### Minimum scripts the developer should already have

From `projects/food-app/backend`:

- `npm test`
- `npm run test:mcp:http`
- `npm run build`

For this phase, the developer should also be able to run only the read-tool tests. Fast reruns matter more than clever structure.

### Minimum red/green loop for this phase

1. Write the first failing MCP read-tool test.
2. Run only that test and verify the tool is missing or behavior is wrong.
3. Implement the smallest schema/tool code to make it pass.
4. Repeat for the second read tool.
5. Run the focused MCP read-tool tests together.
6. Run the existing MCP HTTP smoke test.
7. Run the full backend test suite.
8. Run `npm run build`.
9. Run only the narrow dishes/menu Playwright canaries if backend checks are green.

This phase should not turn into a full regression marathon after every edit.

### Commands the developer should be able to use

From `projects/food-app/backend`:

- `npx vitest run src/mcp/__tests__/browse-dishes.test.ts`
- `npx vitest src/mcp/__tests__/browse-dishes.test.ts`
- `npx vitest run src/mcp/__tests__/view-menu.test.ts`
- `npx vitest src/mcp/__tests__/view-menu.test.ts`
- `npx vitest run src/mcp/__tests__/browse-dishes.test.ts src/mcp/__tests__/view-menu.test.ts`
- `npm run test:mcp:http`
- `npm test`
- `npm run build`

From `projects/food-app/e2e` only as focused UI canaries:

- `npx playwright test tests/dishes.spec.ts`
- `npx playwright test tests/menu.spec.ts`

## What the tests must prove

### `browse_dishes` tests

The MCP tests should prove:

- the tool is listed by `tools/list`,
- missing `auth.token` fails with a stable, testable auth error,
- invalid token fails with a stable, testable auth error,
- valid token returns a deterministic JSON object with `dishes`,
- the returned dishes match the shared service/domain shape rather than a custom MCP-only shape.

### `view_menu` tests

The MCP tests should prove:

- the tool is listed by `tools/list`,
- missing or invalid `auth.token` fails correctly,
- valid token plus a date returns `{ date, entries }`,
- a date with no saved menu still returns the current fallback shape with empty entries.

### Transport canary

The existing HTTP smoke test should still prove:

- `initialize` succeeds,
- `tools/list` works,
- `tools/call` still works,
- sequential calls still do not trip a stale transport/server binding bug.

### Frontend canary

Use `projects/food-app/e2e/tests/dishes.spec.ts` and `projects/food-app/e2e/tests/menu.spec.ts` only as post-backend checks to confirm the service extraction and new MCP reads did not regress the UI routes.

## Deliverable

Hermes can authenticate, then inspect dishes and menus through MCP using shared services and stable agent-facing outputs.

## Must verify

- Unauthenticated read-tool calls fail correctly.
- Authenticated `browse_dishes` calls succeed.
- Authenticated `view_menu` calls succeed.
- Existing MCP transport smoke coverage still passes.
- No REST or UI regression appears.
- `npm run build` still passes.

## Failure smells to watch for

- Read tools query SQLite directly instead of using services.
- Tool handlers return prose blobs instead of deterministic JSON payloads.
- Auth logic gets copied into each tool instead of being factored into a small reusable helper at the MCP boundary.
- `server.ts` turns into a registration tangle for only two tools.
- Read-tool tests only assert that some text exists instead of validating the returned JSON contract.

## Decision locked in

- Protected MCP tools authenticate through `auth.token` in tool inputs.
- Read tools come before mutation tools so the service boundary is proven under lower-risk operations first.
