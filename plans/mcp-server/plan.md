# Food App MCP Server Implementation Plan

> **For Hermes:** plan only. Execute later in small slices. For code work, use strict test-first behavior for domain logic and blackbox integration-first behavior for transport wiring.

**Goal:** Add an MCP server to `projects/food-app/backend` that runs inside the same Express app as the existing service, exposes the core food-app domain operations to Hermes, and can be shipped in a few reviewable phases.

**Architecture:** One backend process, one port, one SQLite database, one shared domain layer. The MCP server should be mounted at `/mcp` and call backend services directly. No MCP-to-REST loopback. No extra process. No stateful MCP auth session unless we discover it is truly necessary.

**Tech Stack:** TypeScript, Express, SQLite via `better-sqlite3`, existing JWT auth flow, `@modelcontextprotocol/sdk`, `zod`, Vitest for backend tests, Playwright for existing UI regression coverage.

---

## Current status

- Phase 1 merged on `main`
- Phase 2 merged on `main`
- Phase 3 merged on `main`
- Phase 4 merged on `main`
- Phase 5 onward still planned
- Transport hardening called out in Phase 6 still matters; `backend/src/mcp/http.ts` still uses a singleton transport connection

---

## What This Plan Optimizes For

- Keep architecture simple.
- Reuse existing backend logic instead of reimplementing it.
- Reach domain parity with the UI, not screen-by-screen parity.
- Avoid speculative cleanup.
- Get fast feedback from realistic tests, especially around transport.

## Non-Goals For The First Version

- No shopping list support yet.
- No repetition-tracking logic yet.
- No prompts/resources layer yet.
- No horizontal scaling design.
- No separate credential source for MCP; reuse the existing username/password check and JWT signing rules.

## Definition Of UI Parity

For this project, "same way as in UI" means:
- the MCP server exposes the same core domain operations the UI depends on,
- the same validation rules and persistence rules apply,
- the same resulting database state is produced,
- but the interaction shape does not need to mimic the UI screens.

A single MCP tool call may replace several UI clicks. That is fine.

---

## Fresh Design

### Core Shape

Target request flows:
- UI: frontend -> REST route -> service -> SQLite
- Hermes: MCP client -> `/mcp` -> MCP tool -> same service -> SQLite

That means the service layer is the real product boundary. REST and MCP are just adapters.

### Transport Design

Use Streamable HTTP mounted in the main Express app under `/mcp`.

Transport shape for v1:
- one long-lived MCP server definition per backend process,
- request handling that survives repeated sequential MCP HTTP calls cleanly,
- stateless tool handlers,
- protocol/session handling kept in the MCP HTTP transport layer,
- business authentication kept in tool inputs via `auth.token`.

Concretely, the backend should be split like this:
- `src/app.ts`: constructs the Express app so tests can import it without starting a listener.
- `src/mcp/server.ts`: builds the MCP server definition, registers tools, and depends only on services/tool handlers.
- `src/mcp/http.ts`: adapts Express requests at `/mcp` to the MCP Streamable HTTP transport.
- `src/index.ts`: boots the process and mounts the app on the real port.

Request lifecycle for v1:
1. Express receives a request under `/mcp`.
2. The MCP HTTP adapter validates the method/path/content negotiation expected by the SDK.
3. The adapter routes the request through transport handling that preserves correct MCP protocol behavior across repeated calls.
4. The shared MCP server definition handles protocol methods like `initialize`, `tools/list`, and `tools/call`.
5. Tool handlers call the same service layer as REST and return structured MCP results.
6. App-level food authentication remains stateless and explicit in tool input; no MCP-side auth session store is retained.

Protocol responsibilities:
- `initialize`: proves protocol compatibility and server metadata.
- `tools/list`: returns the currently registered tool set and schemas.
- `tools/call`: validates tool input, enforces auth for protected tools, runs shared services, and returns deterministic content.
- health checks or ordinary REST middleware concerns stay outside the MCP protocol path unless they are generic Express concerns like CORS.

Error handling rules:
- malformed HTTP or transport negotiation problems should fail at the HTTP/MCP transport boundary,
- unknown tool names, schema failures, and auth failures should surface as MCP tool/protocol errors with stable messages,
- domain validation failures should stay deterministic and testable,
- do not smuggle food-app auth through custom HTTP headers in v1.

Why this is the right default here:
- Hermes can reach it remotely.
- It is easier to debug than stdio.
- It fits the existing backend deployment model.
- It avoids a second sidecar service.
- It avoids hidden server-side auth state while still keeping protocol state where the MCP SDK expects it.
- It keeps MCP as a thin adapter over the service layer instead of a second application.

### Auth Design

Keep it simple.

Recommended first version:
- Add an MCP `login` tool.
- `login` uses the same credential validation as the existing REST login.
- `login` returns a JWT signed with the same secret and lifetime rules as REST.
- All protected MCP tools take `auth.token` in their input schema.
- Each tool verifies `auth.token` directly using shared auth helpers.
- No MCP session store in phase 1.

Why this is the best starting point:
- one user only,
- minimal moving parts,
- easy to debug,
- stateless,
- no session lifecycle bugs,
- no hidden server-side auth state.

Tradeoff:
- Hermes has to pass `auth.token` on each protected call.
- Hermes already sends structured JSON tool arguments cleanly, so this is acceptable in practice.

That tradeoff is acceptable for v1. If it becomes annoying later, session-backed auth can be a deliberate v2 simplification.

### Tool Scope For V1

Start only with the core domain features:
- `login`
- `browse_dishes`
- `add_dish`
- `edit_dish`
- `remove_dish`
- `import_dishes`
- `view_menu`
- `update_menu`

Leave out:
- `get_shopping_list`
- repetition history / anti-repetition suggestions
- any MCP resources/prompts extras

---

## Exact v1 MCP Tool Contract

Design rule for every v1 tool:
- tool names are agent-facing and task-oriented,
- input schemas are explicit and narrow,
- outputs are deterministic JSON objects,
- protected tools require `auth.token`,
- tool handlers call services directly and do not call REST routes.

### Shared conventions

Protected tool input shape:
```json
{
  "auth": {
    "token": "***"
  }
}
```

Error contract guidance:
- authentication failure: stable unauthorized error,
- schema failure: stable invalid-input error,
- missing entity: stable not-found error,
- domain validation failure: stable validation error,
- transport/protocol failures are tested separately at the MCP HTTP boundary.

Output shape guidance:
- return structured JSON, not prose blobs,
- include the primary domain object or mutation result directly,
- keep field naming aligned with backend domain terms,
- avoid UI-only presentation fields unless Hermes actually needs them.

### `login`

Purpose: exchange username/password for a JWT usable in later tool calls.

Input:
```json
{"username": "string", "password": "***"}
```

Output:
```json
{"token": "***"}
```

Notes: public tool; same credential check and JWT lifetime as REST login.

### `browse_dishes`

Purpose: list available dishes for agent selection and planning.

Input:
```json
{"auth": {"token": "***"}}
```

Output:
```json
{
  "dishes": [
    {
      "id": 1,
      "name": "string",
      "tags": ["string"],
      "takeout": false,
      "ingredients": [{"name": "string", "quantity": 1, "unit": "string"}],
      "instructions": "string",
      "notes": "string",
      "created_at": "string",
      "updated_at": "string"
    }
  ]
}
```

Notes: initially returns the full current dish shape from the service layer; can gain filtering later only if Hermes actually needs it.

### `add_dish`

Purpose: create a new dish using the same rules as the UI/backend.

Input:
```json
{
  "auth": {"token": "***"},
  "dish": {
    "name": "string",
    "tags": ["string"],
    "takeout": false,
    "ingredients": [{"name": "string", "quantity": 1, "unit": "string"}],
    "instructions": "string",
    "notes": "string"
  }
}
```

Output:
```json
{
  "dish": {
    "id": 1,
    "name": "string",
    "tags": ["string"],
    "takeout": false,
    "ingredients": [],
    "instructions": "string",
    "notes": "string",
    "created_at": "string",
    "updated_at": "string"
  }
}
```

### `edit_dish`

Purpose: update an existing dish.

Input:
```json
{
  "auth": {"token": "***"},
  "id": 1,
  "dish": {
    "name": "string",
    "tags": ["string"],
    "takeout": false,
    "ingredients": [],
    "instructions": "string",
    "notes": "string"
  }
}
```

Output: same dish object shape as `add_dish`.

Notes: if the dish does not exist, return a stable not-found error rather than a fake success.

### `remove_dish`

Purpose: delete a dish by id.

Input:
```json
{"auth": {"token": "***"}, "id": 1}
```

Output:
```json
{"success": true}
```

Notes: phase-implementation decision — either preserve current backend semantics or tighten to return not-found when nothing was deleted; decide once in the service layer and keep REST/MCP aligned.

### `import_dishes`

Purpose: bulk import dishes in one call.

Input:
```json
{
  "auth": {"token": "***"},
  "dishes": [
    {
      "name": "string",
      "tags": ["string"],
      "takeout": false,
      "ingredients": [],
      "instructions": "string",
      "notes": "string"
    }
  ]
}
```

Output on success:
```json
{"imported": 3}
```

Output on duplicate-domain failure:
```json
{"error": "Duplicate dishes found", "duplicates": ["Dish A", "Dish B"]}
```

Notes: phase 3 should decide whether duplicate handling remains a structured domain result or is normalized into a tool error; whatever is chosen must stay deterministic and shared with REST behavior.

### `view_menu`

Purpose: read menu entries for a given date.

Input:
```json
{"auth": {"token": "***"}, "date": "YYYY-MM-DD"}
```

Output:
```json
{"date": "YYYY-MM-DD", "entries": []}
```

Notes: if no menu exists, return the date with empty entries, matching current service semantics unless phase 3 deliberately changes that.

### `update_menu`

Purpose: replace the menu entries for a given date.

Input:
```json
{"auth": {"token": "***"}, "date": "YYYY-MM-DD", "entries": []}
```

Output:
```json
{"date": "YYYY-MM-DD", "entries": []}
```

Notes: keep the first version as a full-set operation matching current `setMenu` semantics; only add partial menu mutation tools later if real usage demands them.

---

## Implementation Approach

### Domain Code Loop

For services, validation, and tool logic:
1. Write a failing focused test,
2. Run the focused test,
3. Implement the smallest passing change,
4. Rerun focused tests,
5. Rerun the relevant local suite,
6. Refactor only while green.

### Transport Loop

For `/mcp` wiring and protocol behavior:
1. Write a failing blackbox integration test against the live HTTP handler,
2. Confirm the failure is about transport behavior, not test setup,
3. Implement the smallest transport fix,
4. Rerun the integration test,
5. Run the MCP HTTP suite,
6. Run key REST/UI regression checks.

Do not over-unit-test transport internals if a blackbox test proves the behavior more directly.

### Practical Test Layers

- Service tests: validation, normalization, persistence behavior.
- Tool tests: auth gating, schema validation, service integration.
- MCP HTTP blackbox tests: initialize, tool listing, login, authenticated tool call.
- Existing Playwright tests: confirm UI behavior did not regress.

### Suggested Commands

Backend:
- `cd projects/food-app/backend && npm test`
- `cd projects/food-app/backend && npm run test:watch`
- `cd projects/food-app/backend && npm run test:mcp:http`
- `cd projects/food-app/backend && npx vitest run src/services/__tests__/auth.test.ts`
- `cd projects/food-app/backend && npx vitest run src/mcp/__tests__/login-tool.test.ts`
- `cd projects/food-app/backend && npm run build`

UI regression:
- `cd projects/food-app/e2e && npx playwright test tests/auth.spec.ts`
- `cd projects/food-app/e2e && npx playwright test tests/dishes.spec.ts`
- `cd projects/food-app/e2e && npx playwright test tests/menu.spec.ts`
- `cd projects/food-app/e2e && npx playwright test tests/import-copy.spec.ts`

---

## Review Slices

If you want reviewable PRs, keep them roughly like this:
1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6-7

That is enough slicing. More than that starts to create process overhead.

## Main Technical Risks

### 1. MCP HTTP lifecycle bugs

This is the biggest risk. Watch for:
- one long-lived MCP server instance incorrectly shared across incompatible request lifecycles,
- incorrect header/content negotiation,
- transport assumptions that work in tests but not from Hermes,
- hidden coupling between Express request lifecycle and MCP request handling.

### 2. Validation drift between REST and MCP

If services do not own validation, parity will rot.

### 3. Stateless token ergonomics

Passing token in each tool call is simple but may be mildly annoying. That is acceptable for now. Do not solve a convenience problem with hidden state unless the pain is real.

### 4. Over-cleanup

The easiest way to waste time here is broad refactoring justified as groundwork. Avoid it.

## Decisions Locked In For This Version

- Repo path is `projects/food-app`.
- Plan file lives in the repo, not under `.hermes/plans/`.
- Domain parity, not UI interaction parity.
- No shopping list in v1.
- No MCP auth session store in v1.
- No internal HTTP loopback.
- Use Streamable HTTP under `/mcp`.

## Open Questions Worth Resolving During Implementation

- Do menu services already capture all backend-side rules needed for MCP parity?
- Does Hermes MCP consumption reveal any tool-schema quirks that should change naming or output shape early?

## Definition Of Done

Done means:
- `/mcp` runs inside the main backend app,
- Hermes can authenticate and perform core dish/menu workflows,
- MCP and REST share service behavior instead of calling each other,
- backend tests and key UI regression tests pass,
- the design stays simple enough that future changes do not require archaeology.

---

## Appendix A: 2026-05-08 MCP 400 diagnosis update

The diagnosis in `projects/food-app/plans/mcp-server/2026-05-08_mcp-400-diagnosis.md` materially changes one transport assumption in this plan.

What changed:
- The old assumption that one long-lived `StreamableHTTPServerTransport` could safely stay connected for the life of the backend process is wrong.
- A singleton transport can remain in an initialized state after one client lifecycle and reject a later fresh client with `Invalid Request: Server already initialized`.
- That failure mode explains the live Hermes `400 Bad Request` discovery failure more directly than the older DELETE-only diagnosis.

What this plan now requires:
- Transport design must be lifecycle-safe for repeated fresh clients, not merely functional for one smoke-tested client.
- Phase 6 verification must include sequential and concurrent multi-client coverage.
- Phase 7 acceptance must prove Hermes can connect after prior MCP sessions already existed, not just after a clean backend restart.

This does not change the v1 auth model or tool contract. It changes the acceptance bar for transport correctness.
