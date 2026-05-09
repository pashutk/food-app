# MCP Subpath Routing Investigation Plan

> **For Hermes:** plan only. Do not change runtime code while writing this document. Use the SDK docs and the existing blackbox tests to decide whether `/mcp` should remain a single endpoint or whether any guard/catch-all behavior is needed around subpaths.

**Goal:** Decide how the `food-app` backend should handle requests under `/mcp` beyond the canonical MCP endpoint, and document the safest implementation path if current behavior is misleading or broken.

**Architecture:** Treat MCP as a protocol endpoint first, not a URL tree. The likely correct design is one canonical endpoint at `/mcp` with method-based handling (`POST`, `GET`, `DELETE`), plus explicit rejection or exclusion behavior for non-canonical `/mcp/*` paths so the SPA fallback cannot swallow them. The investigation must confirm that against the SDK and the MCP transport contract before any code change.

**Tech Stack:** TypeScript, Express, `@modelcontextprotocol/sdk`, Streamable HTTP MCP transport, Vitest blackbox transport tests.

---

## Why this plan exists

Current code mounts MCP only on `/mcp` in `backend/src/mcp/http.ts`, which is probably correct for protocol traffic. But `backend/src/app.ts` serves the SPA for every non-`/api` GET request, so unknown paths like `/mcp/foo` can fall through to `index.html`. That is a bad debugging experience and may hide protocol mistakes behind frontend HTML.

The plan is to prove three things before touching code:
1. Whether the MCP SDK expects only one endpoint path.
2. Whether `/mcp/*` should be rejected rather than handled by transport.
3. Whether Express routing should explicitly reserve the `/mcp` namespace from SPA fallback.

---

## Task 1: Confirm the actual MCP HTTP contract from the SDK/docs

**Objective:** Prove whether Streamable HTTP expects one endpoint path or a tree of subroutes.

**Files:**
- Read: `backend/src/mcp/http.ts`
- Read: `backend/src/mcp/__tests__/http-smoke.test.ts`
- Read: `backend/src/mcp/__tests__/transport-termination.test.ts`
- Reference: MCP SDK docs for `StreamableHTTPServerTransport`

**Step 1: Inspect current transport wiring**

Read the transport adapter and note exactly which methods and paths are mounted.

**Step 2: Check SDK docs/examples**

Verify whether official examples mount only `/mcp` and route all protocol operations through method handling rather than URL subpaths.

**Step 3: Record the conclusion**

Expected outcome: either
- `single-endpoint-confirmed`, or
- `subpath-routing-required`

If the second outcome appears, stop and document the exact doc evidence because it would overturn the current design.

---

## Task 2: Map the bad current edge cases in Express

**Objective:** Identify what happens today for invalid MCP-ish paths and why that matters.

**Files:**
- Read: `backend/src/app.ts`
- Read: `backend/src/mcp/http.ts`
- Test target: new or existing MCP transport edge-case test file under `backend/src/mcp/__tests__/`

**Step 1: Trace routing order**

Verify that `/mcp` handlers are registered before the SPA static middleware and the non-`/api` catch-all.

**Step 2: Identify fallthrough behavior**

Confirm whether `GET /mcp/foo` currently reaches the SPA fallback and whether non-GET methods on `/mcp/foo` produce Express 404s.

**Step 3: Decide desired behavior**

Preferred target:
- canonical `/mcp` methods go to transport,
- invalid `/mcp/*` requests return a clear non-HTML error,
- SPA fallback never claims the `/mcp` namespace.

---

## Task 3: Write failing edge-case tests before any fix

**Objective:** Lock in the intended contract around `/mcp` and `/mcp/*`.

**Files:**
- Create or modify: `backend/src/mcp/__tests__/mcp-routing.test.ts`

**Step 1: Add a failing test for SPA exclusion**

Test that `GET /mcp/foo` does not return `index.html`.

**Step 2: Add a failing test for clear invalid-path handling**

Test that `/mcp/foo` returns either 404 JSON/plaintext or another explicit non-HTML response chosen by the implementation.

**Step 3: Re-run targeted transport/routing tests**

Use a narrow Vitest command so routing work stays fast.

---

## Task 4: Implement the smallest routing fix

**Objective:** Reserve the MCP namespace without expanding MCP into fake subroutes.

**Files:**
- Modify: `backend/src/app.ts`
- Possibly modify: `backend/src/mcp/http.ts`

**Implementation target:**
- keep transport bound only to canonical `/mcp`,
- update the SPA catch-all so `/mcp` paths are excluded,
- optionally add a small explicit `/mcp/*` handler that returns a stable error if that proves cleaner than relying on a catch-all exclusion alone.

**Constraints:**
- Do not create a fake nested MCP router tree unless the SDK docs require it.
- Do not spread transport behavior into unrelated middleware.
- Keep the fix boring and local.

---

## Task 5: Verify with blackbox tests and docs notes

**Objective:** Prove the fix does not break real MCP behavior.

**Files:**
- Test: `backend/src/mcp/__tests__/http-smoke.test.ts`
- Test: `backend/src/mcp/__tests__/transport-termination.test.ts`
- Test: `backend/src/mcp/__tests__/mcp-routing.test.ts`
- Optionally update docs if the routing contract was previously ambiguous

**Step 1: Run routing edge-case tests**

Expected: new routing tests pass.

**Step 2: Run MCP transport smoke tests**

Expected: `initialize`, `tools/list`, and `DELETE /mcp` still work.

**Step 3: Record conclusion**

Summarize whether the issue was:
- no issue at all,
- only a misleading SPA fallback issue, or
- a real MCP transport routing issue.

---

## Expected conclusion

Most likely conclusion:
- MCP should stay as one endpoint at `/mcp`.
- We should not bind arbitrary `/mcp/*` paths to the transport.
- We probably should reserve `/mcp` from the SPA fallback so bad MCP URLs fail clearly instead of returning frontend HTML.

If the SDK docs contradict that, this plan should be updated before code work starts.
