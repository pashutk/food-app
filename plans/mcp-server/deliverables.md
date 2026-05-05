# MCP Server Deliverables

Consolidated deliverables across all 7 phases.

## Phase 1 — Transport foundation

**Deliverable:** The backend can serve a minimal MCP endpoint in-process and pass a real-client initialize plus tool-list smoke test.

- [x] Backend test harness and MCP dependencies added
- [x] Minimal MCP server mounted at `/mcp` in the existing Express app
- [x] Server definition in `src/mcp/server.ts`, Express adapter in `src/mcp/http.ts`, app wiring in `src/index.ts`
- [x] Blackbox test using a real MCP HTTP client transport
- [x] Both initialize and `list_tools()` succeed from the client side

## Phase 2 — Auth primitives

**Deliverable:** REST and MCP both use the same minimal auth logic, without session state.

- [x] Credential verification and token verification/issuance helpers extracted to `src/services/auth.ts`
- [x] REST login still works exactly as today
- [x] MCP `login` tool returns JWT
- [x] Protected-tool contract documented: `auth.token` required in protected tool input schemas

## Phase 3 — Service boundaries

**Deliverable:** Dish and menu services are the single domain boundary for the initial MCP scope.

- [x] Validation/normalization that MCP needs moved into services
- [x] Routes kept thin
- [x] Service return semantics explicit enough for both REST and MCP adapters
- [x] No unrelated service cleanup performed

## Phase 4 — Read tools

**Deliverable:** Hermes can inspect dishes and menus through MCP with domain parity.

- [x] `browse_dishes` tool implemented with agent-oriented input schemas
- [x] `view_menu` tool implemented
- [x] `auth.token` required and verified inside tool paths
- [x] Deterministic outputs suitable for agent use
- [x] Unauthenticated calls fail correctly
- [ ] No REST or UI regression

## Phase 5 — Mutation tools

**Deliverable:** MCP can perform the main dish and menu operations the UI already depends on.

- [ ] `add_dish` tool implemented
- [ ] `edit_dish` tool implemented
- [ ] `remove_dish` tool implemented
- [ ] `import_dishes` tool implemented
- [ ] `update_menu` tool implemented
- [ ] Each mutation has success, auth failure, and validation failure coverage
- [ ] Existing UI CRUD/menu tests still pass

## Phase 6 — Blackbox tests and hardening

**Deliverable:** A realistic MCP end-to-end test loop exists and protects deployment.

- [ ] Blackbox tests for initialize, `list_tools()`, login, one authenticated read flow, and one authenticated mutation flow
- [ ] Content negotiation and protocol behavior verified
- [ ] Known failure points hardened: connect lifecycle, headers, error shape, request handling
- [ ] Operator smoke script (if useful)

## Phase 7 — Hermes consumption check

**Deliverable:** The system is not just implemented; it is proven usable from Hermes.

- [ ] `/mcp` documented in README
- [ ] Hermes-side configuration shape documented
- [ ] Auth flow documented (server-level headers vs app-level token)
- [ ] One realistic Hermes flow validated: login -> browse dishes -> update menu
- [ ] Protocol/schema caveats recorded

## Overall Definition Of Done

- [x] `/mcp` runs inside the main backend app
- [ ] Hermes can authenticate and perform core dish/menu workflows
- [x] MCP and REST share service behavior instead of calling each other
- [ ] Backend tests and key UI regression tests pass
- [ ] Design stays simple enough that future changes do not require archaeology
