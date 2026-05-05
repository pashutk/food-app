# Phase 3: Tighten only MCP-required service boundaries

**Objective:** Make dishes and menus reusable enough for MCP without broad cleanup or speculative redesign.

**Why here:** Transport and shared auth already define the adapter shape. This phase should only move domain behavior that the upcoming read and mutation tools actually need.

## Developer context you need before touching code

- `projects/food-app/backend/src/routes/dishes.ts` still owns dish persistence, JSON serialization, duplicate detection for bulk import, and `404` shaping for missing updates. There is no `src/services/dishes.ts` yet on the current branch.
- `projects/food-app/backend/src/routes/menus.ts` still owns menu reads/writes directly against SQLite. There is no `src/services/menus.ts` yet on the current branch.
- Phase 4 and Phase 5 will add MCP tools named `browse_dishes`, `view_menu`, `add_dish`, `edit_dish`, `remove_dish`, `import_dishes`, and `update_menu`. Those tools should call services directly, not reimplement route logic.
- Existing REST routes are already the behavioral baseline. This phase is not permission to redesign payloads, validation copy, or error strings unless a focused test proves the current behavior is already wrong.
- `projects/food-app/backend/src/services/auth.ts` and its tests already established the intended pattern for shared logic: small reusable primitives with Express/MCP response shaping left in adapters.
- Existing UI coverage for dishes/menus lives in `projects/food-app/e2e/tests/`. Use focused backend tests first, then only the narrowest useful Playwright canaries.

## Constraints

- Create only the service surface MCP needs now. Do not generalize for future shopping-list or repetition features.
- Keep REST request/response contracts stable. Routes may become thin wrappers, but successful payloads and known failure shapes should stay the same.
- Keep SQLite access in the service layer once extracted. MCP tools must not duplicate SQL from routes.
- Keep adapter-owned concerns in adapters:
  - Express routes own HTTP status codes and REST error envelopes.
  - MCP tools will own tool schema validation and MCP result formatting.
  - Services own domain reads/writes, normalization, and domain-level "not found" / duplicate outcomes.
- Do not add hidden auth behavior to dishes or menus services. Auth remains outside these services.
- Avoid unrelated cleanup like schema migrations, table redesigns, or route renaming.

## Files likely to change

- Create `projects/food-app/backend/src/services/dishes.ts`
- Create `projects/food-app/backend/src/services/menus.ts`
- Create `projects/food-app/backend/src/services/__tests__/dishes.test.ts`
- Create `projects/food-app/backend/src/services/__tests__/menus.test.ts`
- Modify `projects/food-app/backend/src/routes/dishes.ts`
- Modify `projects/food-app/backend/src/routes/menus.ts`
- Optionally modify `projects/food-app/backend/package.json` to add focused service-test scripts if the current loop is still too blunt

## Recommended implementation shape

- Extract a small `dishes` service that owns:
  - row parsing from SQLite into the current JSON shape,
  - list-all behavior for browse flows,
  - create behavior with the current defaulting/normalization rules,
  - update behavior with an explicit missing-entity outcome,
  - delete behavior with a simple success result,
  - bulk import duplicate detection and transactional insert behavior.
- Extract a small `menus` service that owns:
  - loading a menu by date with the current fallback to empty entries,
  - upserting a menu by date with the current persisted JSON shape.
- Prefer explicit return values over throwing for expected domain outcomes that adapters must map cleanly. Example: update-by-id should make missing-dish detection obvious to both REST and MCP callers.
- Keep helper types close to the service modules so future MCP tool schemas can reuse the same domain shape.
- If route-level parsing/defaulting behavior is inconsistent today, preserve the existing behavior first, then document any intentional cleanup in the phase file or tests.

## Work

- Add focused service tests for dishes and menus before extracting implementation.
- Move dish row parsing and database access out of `src/routes/dishes.ts` into `src/services/dishes.ts`.
- Move menu row parsing and database access out of `src/routes/menus.ts` into `src/services/menus.ts`.
- Refactor both routes to delegate to the new services while preserving current HTTP behavior.
- Make not-found and duplicate outcomes explicit enough that Phase 4/5 MCP tools can map them without guessing.
- Keep the final route files boring. If they still contain SQL after this phase, the extraction is incomplete.

## Tight feedback loop requirements

### Minimum scripts the developer should already have

From `projects/food-app/backend`:

- `npm test`
- `npm run test:watch`
- `npm run build`

For this phase, the implementer should also be able to run only the new service tests, either through direct Vitest paths or script aliases. The point is to avoid rerunning auth, transport, or Playwright checks on every extraction edit.

### Minimum red/green loop for this phase

1. Write the first focused dishes service test.
2. Run only that dishes test and verify it fails for the missing service or behavior.
3. Implement the smallest service extraction needed to make it pass.
4. Repeat for the next dishes behavior.
5. Do the same for menus service tests.
6. Refactor the REST routes onto the now-green services.
7. Run all backend tests.
8. Run `npm run build`.
9. Run only the narrowest dishes/menu Playwright canaries if backend checks are green.

This phase should stay backend-first. Full UI sweeps after every service edit are a bad feedback loop.

### Commands the developer should be able to use

From `projects/food-app/backend`:

- `npx vitest run src/services/__tests__/dishes.test.ts`
- `npx vitest src/services/__tests__/dishes.test.ts`
- `npx vitest run src/services/__tests__/menus.test.ts`
- `npx vitest src/services/__tests__/menus.test.ts`
- `npm test`
- `npm run build`

From `projects/food-app/e2e` only as focused UI canaries:

- `npx playwright test tests/dishes.spec.ts`
- `npx playwright test tests/menu.spec.ts`

If those exact Playwright specs do not exist, use the smallest existing dishes/menu spec that proves the routes still satisfy the UI.

## What the tests must prove

### Dishes service tests

The service-level tests should prove:

- listing dishes returns the current parsed domain shape in stable name order,
- create applies the same defaults currently hardcoded in the route (`tags`, `takeout`, `ingredients`, `instructions`, `notes`),
- update returns an explicit missing result when the dish does not exist,
- update returns the parsed updated dish when it does exist,
- delete removes the row and reports success without needing HTTP wrappers,
- bulk import rejects case-insensitive duplicate names against existing dishes,
- bulk import inserts all rows transactionally when there are no duplicates.

### Menus service tests

The service-level tests should prove:

- loading a missing date returns `{ date, entries: [] }`,
- loading an existing date returns parsed entries,
- upsert persists entries and returns the same domain shape adapters already expose.

### REST canary checks

The REST-side checks should prove:

- dishes list/create/update/delete/import routes still return the same shapes they returned before extraction,
- menu get/put routes still return the same shapes they returned before extraction,
- missing-dish update still becomes REST `404` with the existing error body,
- duplicate import still becomes REST `409` with the existing duplicate payload.

### Frontend canary

Use the smallest existing Playwright dishes/menu specs to prove that the UI still works against the refactored backend.

## Deliverable

Dishes and menus services become the single reusable domain boundary for the initial MCP scope, and the REST routes become thin adapters over those services.

## Must verify

- Dishes service tests pass.
- Menus service tests pass.
- Existing backend route tests or focused route canaries still pass.
- Existing dishes/menu UI canaries still pass.
- `npm run build` still passes.

## Failure smells to watch for

- SQL still lives in MCP tools or route files after the phase.
- Services start returning Express `Response` objects or MCP-shaped `content` blobs.
- The extraction changes REST payload shapes just because the service types were made cleaner.
- The phase introduces speculative filtering/query abstractions that Phase 4 does not need.
- Duplicate handling or not-found semantics become implicit again instead of explicit and testable.

## Decision locked in

- The service layer is the domain boundary; REST and MCP are adapters.
- Preserve current dishes/menu behavior first, then tighten only what the upcoming MCP tools truly require.
