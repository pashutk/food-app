# Phase 2: Add only the shared auth primitives actually needed

**Objective:** Reuse existing auth behavior without prematurely redesigning it.

**Why second:** Once transport works, the next highest risk is protected tool access.

## Developer context you need before touching code

- Current REST login logic lives inline in `projects/food-app/backend/src/routes/auth.ts` and directly compares `username`/`password` against `AUTH_USERNAME` and `AUTH_PASSWORD`.
- Current REST auth middleware lives in `projects/food-app/backend/src/middleware/auth.ts` and directly verifies the bearer token with `jwt.verify(...)`.
- Today the auth behavior is split across route and middleware, with duplicated JWT knowledge and no shared service boundary.
- Existing UI auth regression coverage already exists in `projects/food-app/e2e/tests/auth.spec.ts`; use that as the default frontend canary for this phase.
- Phase 1 should already have introduced a backend test harness plus an importable app shape. If it did not, fix phase 1 first. Do not bolt auth tests onto a backend that still starts listeners on import.

## Constraints

- Keep auth stateless in this phase. No server-side session store.
- Do not redesign user management. This app still has one configured credential pair.
- Do not change external REST auth behavior unless a test proves the old behavior was already wrong.
- Do not make MCP login the source of truth while REST keeps different rules. Shared primitives are the point of this phase.
- Do not pull protected-tool auth from HTTP headers. Protected MCP tools should validate `auth.token` from tool input.

## Files likely to change

- Create `projects/food-app/backend/src/services/auth.ts`
- Create `projects/food-app/backend/src/services/__tests__/auth.test.ts`
- Modify `projects/food-app/backend/src/routes/auth.ts`
- Modify `projects/food-app/backend/src/middleware/auth.ts`
- Create `projects/food-app/backend/src/mcp/tools/login.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/login-tool.test.ts`
- Modify `projects/food-app/backend/src/mcp/server.ts`

## Recommended implementation shape

- Extract only the minimal reusable primitives into `projects/food-app/backend/src/services/auth.ts`.
- That service should own three things and no more:
  - credential verification against `AUTH_USERNAME` / `AUTH_PASSWORD`,
  - JWT issuance with the current payload and expiry rules,
  - JWT verification for protected access.
- Keep Express-specific response shaping in the route and middleware layers.
- Keep MCP-specific input/output shaping in the MCP tool layer.
- If you need shared error names, keep them small and boring. Avoid building a fake auth framework.

## Work

- Add focused service tests around credential acceptance/rejection, token issuance, and token verification.
- Refactor `src/routes/auth.ts` to call the new auth service without changing its successful and failing response shapes.
- Refactor `src/middleware/auth.ts` to call the same verification primitive without changing existing REST unauthorized behavior unless a test intentionally updates it.
- Implement MCP `login` returning JWT through the same auth service.
- Register the login tool in the MCP server.
- Decide and document the protected-tool contract: `auth.token` is required in protected tool input schemas.

## Tight feedback loop requirements

### Minimum scripts the developer should already have from phase 1

From `projects/food-app/backend`:

- `npm test`
- `npm run test:watch`
- `npm run test:mcp:http`
- `npm run build`

For this phase, the implementer should also be able to run a focused auth subset, either through an explicit script or a direct Vitest path filter. The important part is fast iteration on auth tests without invoking the whole backend or Playwright suite.

### Minimum red/green loop for this phase

1. Write the focused auth service test first.
2. Run only the auth service test.
3. Implement the smallest shared auth extraction.
4. Re-run the auth service test until green.
5. Run the focused MCP login test.
6. Run the REST auth canary.
7. Run `npm run build`.
8. Run the Playwright auth canary only after backend-focused checks are green.

This phase should not require `tests/dishes.spec.ts` or `tests/menu.spec.ts` after every edit. That is wasted cycle time.

### Commands the developer should be able to use

From `projects/food-app/backend`:

- `npx vitest run src/services/__tests__/auth.test.ts`
- `npx vitest src/services/__tests__/auth.test.ts`
- `npx vitest run src/mcp/__tests__/login-tool.test.ts`
- `npm test`
- `npm run build`

From `projects/food-app/e2e` only as the frontend auth canary:

- `npx playwright test tests/auth.spec.ts`

If you add backend script aliases for the two focused Vitest targets, even better. The goal is zero ambiguity and near-instant reruns.

## What the tests must prove

### Auth service tests

The service-level tests should prove:

- valid configured credentials are accepted,
- invalid username is rejected,
- invalid password is rejected,
- issued token verifies successfully,
- malformed or expired-looking token input is rejected deterministically.

Keep these tests fast and isolated from HTTP.

### MCP login tests

The MCP login tests should prove:

- `login` succeeds with valid credentials,
- `login` returns a JWT that the shared verification primitive accepts,
- `login` rejects invalid credentials with a stable, testable error shape,
- the tool does not reimplement credential comparison on its own.

### REST canary checks

The REST-side checks should prove:

- `POST /api/auth/login` still returns `{ token }` on valid credentials,
- invalid credentials still produce the expected unauthorized response,
- existing bearer-token middleware still accepts a real token from the shared issuer.

### Frontend canary

Use `projects/food-app/e2e/tests/auth.spec.ts` to prove auth behavior still works from the UI perspective:

- login page still renders,
- failed login still shows the expected error,
- successful login still reaches the authenticated app shell,
- logout still returns to login.

## Deliverable

REST and MCP both use the same minimal auth logic, without session state, and the auth workflow has fast focused tests plus one cheap UI canary.

## Must verify

- Auth service tests pass.
- MCP login test passes and returns a token accepted by shared verification.
- Existing REST login behavior still passes its focused checks.
- Existing UI auth tests still pass.
- `npm run build` still passes.

## Failure smells to watch for

- The new auth service starts owning Express response objects or MCP result formatting.
- REST and MCP each still compare credentials independently after the refactor.
- Tests only check that a token string exists, not that it verifies.
- The phase introduces hidden session state even though `auth.token` is supposed to stay stateless.
- The developer relies on full Playwright runs for every auth change and stops iterating tightly.

## Decision locked in

- Lock shared auth behavior, not identical error strings.
- REST and MCP may format auth failures differently at their adapter layers as long as behavior stays consistent and testable.
