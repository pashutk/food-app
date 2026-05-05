# Phase 5: Implement mutation tools

**Objective:** Expose the real create/update/delete/import workflows that make the MCP server useful, while preserving the same domain behavior the UI already depends on.

**Why fifth:** Mutation tools should only land after Phase 3 service extraction and Phase 4 read-tool contracts have proven the service boundary, auth contract, and MCP registration shape under lower-risk reads.

## Developer context you need before touching code

- Current REST mutation behavior still lives in `projects/food-app/backend/src/routes/dishes.ts` and `projects/food-app/backend/src/routes/menus.ts` on this branch. Phase 5 should assume Phase 3 has already extracted those writes into services before MCP tools are added.
- The existing REST behavior you must preserve includes:
  - dish create defaults for `tags`, `takeout`, `ingredients`, `instructions`, and `notes`,
  - dish update returning REST `404` with `{ error: 'Not found' }` when the id does not exist,
  - dish delete returning `{ success: true }`,
  - dish import rejecting non-arrays with REST `400` and `{ error: 'Expected an array' }`,
  - dish import rejecting case-insensitive duplicates with REST `409` and `{ error: 'Duplicate dishes found', duplicates }`,
  - menu update returning `{ date, entries }` for the target date.
- Phase 4 already locked the MCP auth contract: protected tools require `auth.token` in tool inputs and verify it with the shared auth service.
- `projects/food-app/e2e/tests/dishes.spec.ts`, `projects/food-app/e2e/tests/menu.spec.ts`, and `projects/food-app/e2e/tests/import-copy.spec.ts` are the existing UI-facing canaries relevant to this phase after backend checks are green.
- `projects/food-app/backend/src/mcp/server.ts` currently has a simple direct-registration style. Keep that flow readable; do not build an abstraction maze for five tools.

## Constraints

- Do not add shopping-list logic, repetition tracking, bulk planning helpers, or any other v2 behavior in this phase.
- Do not duplicate SQL or persistence rules inside MCP tools. Mutation tools must call shared services.
- Do not force MCP outputs to mimic REST status codes or envelopes. Behavior parity matters; adapter formatting can differ.
- Do not hide auth in HTTP headers or server-side MCP session state. Keep protected mutation tools stateless with `auth.token` input.
- Keep outputs deterministic and narrow: return the mutated entity or mutation result directly.
- Implement one tool at a time and get it green before moving to the next. Bulk-editing all five tools at once is how regressions slip in.

## Files likely to change

- Create `projects/food-app/backend/src/mcp/tools/add-dish.ts`
- Create `projects/food-app/backend/src/mcp/tools/edit-dish.ts`
- Create `projects/food-app/backend/src/mcp/tools/remove-dish.ts`
- Create `projects/food-app/backend/src/mcp/tools/import-dishes.ts`
- Create `projects/food-app/backend/src/mcp/tools/update-menu.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/add-dish.test.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/edit-dish.test.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/remove-dish.test.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/import-dishes.test.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/update-menu.test.ts`
- Modify `projects/food-app/backend/src/mcp/tools/index.ts` if Phase 4 introduced it
- Modify `projects/food-app/backend/src/mcp/server.ts`
- Optionally modify `projects/food-app/backend/src/mcp/schemas.ts` if shared protected-input or dish/menu payload schemas actually reduce duplication
- Optionally modify `projects/food-app/backend/package.json` for focused mutation-test scripts if iteration speed needs it

## Recommended implementation shape

- Implement a small reusable protected-tool auth helper at the MCP boundary only if it prevents obvious duplication across the five mutation tools. Keep it tiny: verify token or fail with a stable auth error.
- Implement `add_dish` as a protected tool that:
  - accepts an agent-friendly `dish` object,
  - calls the dishes service create function,
  - returns `{ dish }` in the same domain shape used by reads.
- Implement `edit_dish` as a protected tool that:
  - accepts `id` plus a `dish` payload,
  - calls the dishes service update function,
  - maps the explicit missing-dish service outcome to a stable MCP not-found error/result.
- Implement `remove_dish` as a protected tool that:
  - accepts `id`,
  - calls the dishes service delete function,
  - returns a simple deterministic success object.
- Implement `import_dishes` as a protected tool that:
  - accepts an array of dish inputs,
  - reuses the service bulk-import logic,
  - maps expected invalid-input and duplicate outcomes cleanly without inventing new persistence behavior.
- Implement `update_menu` as a protected tool that:
  - accepts `date` and `entries`,
  - calls the menus service upsert function,
  - returns `{ date, entries }` in the same domain shape as `view_menu`.
- If `tools/index.ts` exists, it should help with registration only. Do not move domain logic into an index barrel.

## Work

- Write a focused failing MCP test for each mutation tool before implementing it.
- Implement `add_dish` and get it green first.
- Implement `edit_dish` and explicitly cover not-found behavior.
- Implement `remove_dish` and verify success semantics.
- Implement `import_dishes` and explicitly cover array validation plus duplicate detection.
- Implement `update_menu` and verify parity with the menu service/read contract.
- Register all mutation tools in the MCP server.
- Re-run the read-tool and transport canaries after mutation tools are green.

## Tight feedback loop requirements

### Minimum scripts the developer should already have

From `projects/food-app/backend`:

- `npm test`
- `npm run test:mcp:http`
- `npm run build`

For this phase, the developer should also be able to run only the mutation-tool tests. Do not rerun the entire stack for every one-line schema edit.

### Minimum red/green loop for this phase

1. Write the failing MCP test for one mutation tool.
2. Run only that test and verify the failure is real.
3. Implement the smallest schema/tool code to make it pass.
4. Re-run that single test until green.
5. Move to the next mutation tool.
6. Run all mutation-tool tests together.
7. Re-run the read-tool MCP tests.
8. Run the transport smoke test.
9. Run the full backend suite.
10. Run `npm run build`.
11. Run only the focused UI canaries if backend checks are green.

### Commands the developer should be able to use

From `projects/food-app/backend`:

- `npx vitest run src/mcp/__tests__/add-dish.test.ts`
- `npx vitest run src/mcp/__tests__/edit-dish.test.ts`
- `npx vitest run src/mcp/__tests__/remove-dish.test.ts`
- `npx vitest run src/mcp/__tests__/import-dishes.test.ts`
- `npx vitest run src/mcp/__tests__/update-menu.test.ts`
- `npx vitest run src/mcp/__tests__/add-dish.test.ts src/mcp/__tests__/edit-dish.test.ts src/mcp/__tests__/remove-dish.test.ts src/mcp/__tests__/import-dishes.test.ts src/mcp/__tests__/update-menu.test.ts`
- `npm run test:mcp:http`
- `npm test`
- `npm run build`

From `projects/food-app/e2e` only as focused UI canaries:

- `npx playwright test tests/dishes.spec.ts`
- `npx playwright test tests/menu.spec.ts`
- `npx playwright test tests/import-copy.spec.ts`

## What the tests must prove

### `add_dish` tests

The MCP tests should prove:

- the tool is listed by `tools/list`,
- missing or invalid `auth.token` fails correctly,
- valid input returns `{ dish }` with the current defaulting/normalization rules applied,
- the created dish shape matches the shared service/domain shape.

### `edit_dish` tests

The MCP tests should prove:

- auth failures are handled correctly,
- valid update returns the updated dish,
- a missing id produces a stable, testable not-found outcome,
- the tool does not reimplement update semantics independently of the shared service.

### `remove_dish` tests

The MCP tests should prove:

- auth failures are handled correctly,
- valid delete returns a deterministic success result,
- the dish is actually removed from subsequent reads or service lookups.

### `import_dishes` tests

The MCP tests should prove:

- auth failures are handled correctly,
- non-array input fails deterministically,
- duplicate names are rejected case-insensitively with a stable duplicate payload/outcome,
- valid imports report the number imported,
- service transaction behavior is preserved for successful imports.

### `update_menu` tests

The MCP tests should prove:

- auth failures are handled correctly,
- valid input returns `{ date, entries }`,
- a subsequent `view_menu` or service read sees the updated entries.

### Regression canaries

After mutation tools are green, re-prove:

- MCP read tools still pass,
- MCP transport still passes,
- UI dishes/menu/import behaviors still pass their focused Playwright canaries.

## Deliverable

MCP can perform the main dish and menu mutations the UI already depends on, using shared services and stable agent-facing contracts.

## Must verify

- Each mutation tool has success coverage.
- Each protected mutation tool has auth failure coverage.
- `edit_dish` has explicit not-found coverage.
- `import_dishes` has invalid-input and duplicate coverage.
- Existing read-tool and transport MCP checks still pass.
- Existing UI CRUD/menu/import canaries still pass.
- `npm run build` still passes.

## Failure smells to watch for

- Mutation tools duplicate SQL or route logic instead of calling services.
- MCP schemas are copied five times with only cosmetic differences.
- Not-found, duplicate, or invalid-input behavior becomes implicit and untestable.
- Tool outputs drift into prose instead of deterministic JSON mutation results.
- The phase quietly adds extra features that were explicitly deferred from v1.

## Decision locked in

- Mutation tools come after read tools and must reuse the same shared domain/service boundary.
- Behavior parity with REST/UI matters more than copying REST response envelopes into MCP.
