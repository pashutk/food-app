# Food App MCP Server Implementation Plan

> **For Hermes:** plan only. Execute later in small slices. For code work, use strict test-first behavior for domain logic and blackbox integration-first behavior for transport wiring.

**Goal:** Add an MCP server to `projects/food-app/backend` that runs inside the same Express app as the existing service, exposes the core food-app domain operations to Hermes, and can be shipped in a few reviewable phases.

**Architecture:** One backend process, one port, one SQLite database, one shared domain layer. The MCP server should be mounted at `/mcp` and call backend services directly. No MCP-to-REST loopback. No extra process. No stateful MCP auth session unless we discover it is truly necessary.

**Tech Stack:** TypeScript, Express, SQLite via `better-sqlite3`, existing JWT auth flow, `@modelcontextprotocol/sdk`, `zod`, Vitest for backend tests, Playwright for existing UI regression coverage.

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
- a fresh request-scoped HTTP transport binding for each incoming MCP HTTP exchange,
- stateless tool handlers,
- protocol/session handling kept in the MCP HTTP transport layer,
- business authentication kept in tool inputs via `auth.token`.

Concretely, the backend should be split like this:
- `src/mcp/server.ts`: builds the MCP server definition, registers tools, and depends only on services/tool handlers.
- `src/mcp/http.ts`: adapts Express requests at `/mcp` to the MCP Streamable HTTP transport.
- `src/index.ts`: mounts the `/mcp` route alongside existing REST routes on the same app and port.

Request lifecycle for v1:
1. Express receives a request under `/mcp`.
2. The MCP HTTP adapter validates the method/path/content negotiation expected by the SDK.
3. The adapter creates or attaches the request to a request-scoped Streamable HTTP transport object.
4. That transport is connected to the shared MCP server definition for the lifetime of the exchange only.
5. The MCP server handles protocol methods like `initialize`, `tools/list`, and `tools/call`.
6. Tool handlers call the same service layer as REST and return structured MCP results.
7. Transport cleanup happens at the end of the exchange; no app-auth session state is retained.

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
    "token": "<jwt>"
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

Purpose:
- exchange username/password for a JWT usable in later tool calls.

Input:
```json
{
  "username": "string",
  "password": "string"
}
```

Output:
```json
{
  "token": "string"
}
```

Notes:
- public tool,
- same credential check and JWT lifetime as REST login.

### `browse_dishes`

Purpose:
- list available dishes for agent selection and planning.

Input:
```json
{
  "auth": {
    "token": "string"
  }
}
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
      "ingredients": [
        {
          "name": "string",
          "quantity": 1,
          "unit": "string"
        }
      ],
      "instructions": "string",
      "notes": "string",
      "created_at": "string",
      "updated_at": "string"
    }
  ]
}
```

Notes:
- initially returns the full current dish shape from the service layer,
- can gain filtering later only if Hermes actually needs it.

### `add_dish`

Purpose:
- create a new dish using the same rules as the UI/backend.

Input:
```json
{
  "auth": {
    "token": "string"
  },
  "dish": {
    "name": "string",
    "tags": ["string"],
    "takeout": false,
    "ingredients": [
      {
        "name": "string",
        "quantity": 1,
        "unit": "string"
      }
    ],
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

Purpose:
- update an existing dish.

Input:
```json
{
  "auth": {
    "token": "string"
  },
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

Notes:
- if the dish does not exist, return a stable not-found error rather than a fake success.

### `remove_dish`

Purpose:
- delete a dish by id.

Input:
```json
{
  "auth": {
    "token": "string"
  },
  "id": 1
}
```

Output:
```json
{
  "success": true
}
```

Notes:
- phase-implementation decision: either preserve current backend semantics or tighten them to return not-found when nothing was deleted,
- decide once in the service layer and keep REST/MCP aligned.

### `import_dishes`

Purpose:
- bulk import dishes in one call.

Input:
```json
{
  "auth": {
    "token": "string"
  },
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
{
  "imported": 3
}
```

Output on duplicate-domain failure if preserved as structured result rather than thrown error:
```json
{
  "error": "Duplicate dishes found",
  "duplicates": ["Dish A", "Dish B"]
}
```

Notes:
- phase 3 should decide whether duplicate handling remains a structured domain result or is normalized into a tool error,
- whatever is chosen must stay deterministic and shared with REST behavior if REST exposes the same operation.

### `view_menu`

Purpose:
- read menu entries for a given date.

Input:
```json
{
  "auth": {
    "token": "string"
  },
  "date": "YYYY-MM-DD"
}
```

Output:
```json
{
  "date": "YYYY-MM-DD",
  "entries": []
}
```

Notes:
- if no menu exists, return the date with empty entries, matching current service semantics unless phase 3 deliberately changes that.

### `update_menu`

Purpose:
- replace the menu entries for a given date.

Input:
```json
{
  "auth": {
    "token": "string"
  },
  "date": "YYYY-MM-DD",
  "entries": []
}
```

Output:
```json
{
  "date": "YYYY-MM-DD",
  "entries": []
}
```

Notes:
- keep the first version as a full-set operation matching current `setMenu` semantics,
- only add partial menu mutation tools later if real usage demands them.

### Domain Code Loop

For services, validation, and tool logic:
1. write a failing focused test,
2. run the focused test,
3. implement the smallest passing change,
4. rerun focused tests,
5. rerun the relevant local suite,
6. refactor only while green.

### Transport Loop

For `/mcp` wiring and protocol behavior, use a more realistic loop:
1. write a failing blackbox integration test against the live HTTP handler,
2. confirm the failure is about transport behavior, not test setup,
3. implement the smallest transport fix,
4. rerun the integration test,
5. run the MCP HTTP suite,
6. run key REST/UI regression checks.

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
- `cd projects/food-app/backend && npm run test:mcp`
- `cd projects/food-app/backend && npm run test:mcp:http`

UI regression:
- `cd projects/food-app/e2e && npm test`
- `cd projects/food-app/e2e && npx playwright test tests/auth.spec.ts`
- `cd projects/food-app/e2e && npx playwright test tests/dishes.spec.ts tests/menu.spec.ts`

---

## Lean 7-Phase Plan

### Phase 1: Prove transport shape before deeper refactors

**Objective:** Validate the in-process MCP transport design early, before spending time on broad cleanup.

**Why first:** The highest-risk part is not CRUD logic. It is HTTP transport wiring, MCP lifecycle, and request handling.

**Files likely to change:**
- Modify `projects/food-app/backend/package.json`
- Modify `projects/food-app/backend/package-lock.json`
- Create `projects/food-app/backend/vitest.config.ts`
- Create `projects/food-app/backend/src/test/setup.ts`
- Create `projects/food-app/backend/src/mcp/server.ts`
- Create `projects/food-app/backend/src/mcp/http.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts`
- Modify `projects/food-app/backend/src/index.ts`

**Work:**
- Add backend test harness and MCP dependencies.
- Mount a minimal MCP server at `/mcp` in the existing Express app.
- Split responsibilities explicitly: server definition in `src/mcp/server.ts`, Express adapter in `src/mcp/http.ts`, app wiring in `src/index.ts`.
- Implement the smallest possible live endpoint that can initialize correctly and expose at least one trivial tool.
- Add a blackbox test using a real MCP HTTP client transport.
- Treat Phase 1 as incomplete unless both initialize and `list_tools()` succeed from the client side.

**Deliverable:** The backend can serve a minimal MCP endpoint in-process and pass a real-client initialize plus tool-list smoke test.

**Must verify:**
- The endpoint boots in the main app.
- The MCP client can initialize successfully.
- `list_tools()` succeeds from the real client and returns the expected minimal tool set.
- A real `tools/call` request can hit a trivial tool through the same HTTP path.
- No singleton-connect bug or header mismatch is hiding.

### Phase 2: Add only the shared auth primitives actually needed

**Objective:** Reuse existing auth behavior without prematurely redesigning it.

**Why second:** Once transport works, the next highest risk is protected tool access.

**Files likely to change:**
- Create `projects/food-app/backend/src/services/auth.ts`
- Create `projects/food-app/backend/src/services/__tests__/auth.test.ts`
- Modify `projects/food-app/backend/src/routes/auth.ts`
- Modify `projects/food-app/backend/src/middleware/auth.ts`
- Create `projects/food-app/backend/src/mcp/tools/login.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/login-tool.test.ts`

**Work:**
- Extract only credential verification and token verification/issuance helpers.
- Keep REST login working exactly as today.
- Do not refactor the auth middleware shape beyond what focused tests require.
- Implement MCP `login` returning JWT.
- Decide and document the protected-tool contract: `auth.token` is required in protected tool input schemas.

**Deliverable:** REST and MCP both use the same minimal auth logic, without session state.

**Must verify:**
- Auth service tests pass.
- Existing UI auth tests still pass.
- MCP login works and returns a usable token.

### Phase 3: Tighten only MCP-required service boundaries

**Objective:** Make services reusable enough for MCP without broad cleanup.

**Why here:** Now that transport and auth shape are real, service changes can be constrained by actual MCP needs.

**Files likely to change:**
- Modify `projects/food-app/backend/src/services/dishes.ts`
- Modify `projects/food-app/backend/src/services/menus.ts`
- Modify `projects/food-app/backend/src/routes/dishes.ts`
- Modify `projects/food-app/backend/src/routes/menus.ts`
- Create `projects/food-app/backend/src/services/__tests__/dishes.test.ts`
- Create `projects/food-app/backend/src/services/__tests__/menus.test.ts`

**Work:**
- Move any remaining validation/normalization that MCP will need into services.
- Keep routes thin.
- Avoid unrelated service cleanup.
- Make service return semantics explicit enough for both REST and MCP adapters.

**Deliverable:** Dish and menu services are the single domain boundary for the initial MCP scope.

**Must verify:**
- Service tests pass.
- Existing dishes/menu UI regressions still pass.

### Phase 4: Implement read tools first

**Objective:** Deliver the safest useful MCP functionality before mutations.

**Files likely to change:**
- Create `projects/food-app/backend/src/mcp/schemas.ts`
- Create `projects/food-app/backend/src/mcp/tools/browse-dishes.ts`
- Create `projects/food-app/backend/src/mcp/tools/view-menu.ts`
- Create `projects/food-app/backend/src/mcp/tools/index.ts`
- Create tests under `projects/food-app/backend/src/mcp/__tests__/`
- Modify `projects/food-app/backend/src/mcp/server.ts`

**Work:**
- Add tool input schemas designed for agent use; do not mirror REST payloads blindly.
- Implement `browse_dishes` and `view_menu`.
- Require `auth.token` and verify it inside the tool path.
- Return deterministic outputs suitable for agent use.

**Deliverable:** Hermes can inspect dishes and menus through MCP with domain parity.

**Must verify:**
- Unauthenticated calls fail correctly.
- Authenticated read calls succeed.
- No REST or UI regression appears.

### Phase 5: Implement mutation tools

**Objective:** Expose the main create/update/delete workflows that matter for actual use.

**Files likely to change:**
- Create `projects/food-app/backend/src/mcp/tools/add-dish.ts`
- Create `projects/food-app/backend/src/mcp/tools/edit-dish.ts`
- Create `projects/food-app/backend/src/mcp/tools/remove-dish.ts`
- Create `projects/food-app/backend/src/mcp/tools/import-dishes.ts`
- Create `projects/food-app/backend/src/mcp/tools/update-menu.ts`
- Create tests under `projects/food-app/backend/src/mcp/__tests__/`
- Modify `projects/food-app/backend/src/mcp/tools/index.ts`

**Work:**
- Implement one mutation tool at a time.
- Reuse existing service validation and persistence rules.
- Keep output contracts simple and stable.
- Do not add shopping-list or repetition logic yet.

**Deliverable:** MCP can perform the main dish and menu operations the UI already depends on.

**Must verify:**
- Each mutation has success, auth failure, and validation failure coverage.
- Existing UI CRUD/menu tests still pass.

### Phase 6: Add blackbox MCP workflow tests and harden transport details

**Objective:** Catch real integration failures before deployment.

**Why separate from implementation:** Transport bugs often survive unit tests and appear only in live request flows.

**Files likely to change:**
- Create `projects/food-app/backend/test/mcp-http.spec.ts` or similar
- Possibly create `projects/food-app/backend/scripts/mcp-smoke.mjs`
- Modify `projects/food-app/backend/package.json`
- Modify `projects/food-app/backend/src/mcp/http.ts`

**Work:**
- Add blackbox tests for initialize, `list_tools()`, login, one authenticated read flow, and one authenticated mutation flow.
- Verify content negotiation and protocol behavior.
- Harden known failure points: connect lifecycle, headers, error shape, request handling.
- Add a simple operator smoke script if useful.

**Deliverable:** A realistic MCP end-to-end test loop exists and protects deployment.

**Must verify:**
- A real client can complete a full workflow.
- Failures point clearly to transport/auth/tool issues.

### Phase 7: Hermes consumption check and rollout notes

**Objective:** Prove the endpoint is actually usable from Hermes and document the minimal operational workflow.

**Files likely to change:**
- Modify `projects/food-app/README.md`
- Optionally add `projects/food-app/docs/mcp.md`

**Work:**
- Document how the backend exposes `/mcp`.
- Document the expected Hermes-side configuration shape without editing runtime config automatically.
- Note explicitly that Hermes `mcp_servers.<name>.headers` can carry server-level HTTP headers, but app-level food-app auth is handled through MCP tool inputs after `login`.
- Validate one realistic Hermes flow: login -> browse dishes -> update menu.
- Record any protocol or schema caveats discovered.

**Deliverable:** The system is not just implemented; it is proven usable from Hermes.

**Must verify:**
- Hermes can discover and use the endpoint.
- Docs are enough for future setup without archaeology.

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

This is the biggest risk.

Watch for:
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
