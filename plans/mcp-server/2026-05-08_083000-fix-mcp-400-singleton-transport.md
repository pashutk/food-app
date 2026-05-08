# Fix MCP 400 Singleton Transport Failure

> **For Hermes:** plan only. Execute later in small slices. Use strict blackbox-first verification for transport behavior and avoid mixing transport fixes with unrelated tool or auth changes.

**Goal:** Fix the food-app MCP HTTP endpoint so multiple independent clients can connect to `/mcp` reliably without hitting `400 Bad Request` caused by stale singleton transport initialization state.

**Architecture:** Keep the same-process Express plus MCP design, but stop treating `StreamableHTTPServerTransport` as a process-wide singleton. The adapter in `backend/src/mcp/http.ts` should manage MCP transport lifecycle per client session or per request flow so protocol state does not leak across unrelated clients. Preserve the existing app-level auth model: `login` returns a JWT and protected tools still require `auth.token`.

**Tech Stack:** TypeScript, Express, `@modelcontextprotocol/sdk`, Vitest, existing food-app backend MCP test harness, Hermes as the real downstream client.

---

## Current context

- Diagnosis report: `projects/food-app/plans/mcp-server/2026-05-08_mcp-400-diagnosis.md`
- The live symptom is Hermes failing discovery against `https://food.pashutk.com/mcp` with `400 Bad Request` and zero registered tools.
- The diagnosis report traces the current root cause to a singleton `StreamableHTTPServerTransport` in `backend/src/mcp/http.ts` that stays initialized after one client handshake.
- Earlier phase work already fixed the missing `DELETE /mcp` surface, but that only addressed session termination mismatch. It does not solve singleton transport state leakage across client lifecycles.
- This plan owns the next architectural fix: make repeated and concurrent MCP client initialization safe.

## Problem statement

The current MCP adapter appears to bind one shared transport instance to one shared server connection for the life of the process. That is fine only if there is exactly one client lifecycle per process. In reality:

1. Client A initializes the transport successfully.
2. Client A goes away or its session becomes stale.
3. Client B sends a fresh `initialize`.
4. The shared transport rejects it with `Invalid Request: Server already initialized`.
5. Hermes sees `400 Bad Request` and registers zero tools.

That is not an operator mistake. It is an architecture bug in the transport lifecycle.

---

## Proposed approach

- Replace the process-wide singleton transport pattern in `backend/src/mcp/http.ts` with a lifecycle-safe design.
- Preserve one boring MCP server definition if the SDK supports reconnecting it safely, but do not preserve one initialized transport across unrelated clients.
- Add blackbox tests that prove:
  - one client can initialize, use tools, and close,
  - a second fresh client can initialize after the first one,
  - concurrent clients do not fail because of shared initialization state.
- Update the MCP phase docs so they stop implying the singleton transport is acceptable.
- Keep auth, tool contracts, and service-layer behavior out of scope unless transport hardening proves they are implicated.

---

## Files likely to change

- Modify `projects/food-app/backend/src/mcp/http.ts`
- Possibly modify `projects/food-app/backend/src/mcp/server.ts`
- Modify `projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/multi-client-lifecycle.test.ts`
- Modify `projects/food-app/plans/mcp-server/phase-06.md`
- Modify `projects/food-app/plans/mcp-server/phase-07.md`
- Modify `projects/food-app/plans/mcp-server/plan.md`
- Optionally modify `projects/food-app/plans/mcp-server/deliverables.md` if phase acceptance wording needs to reflect the new transport gate

---

## Step-by-step plan

### Task 1: Lock in the failing multi-client behavior

**Objective:** Capture the actual singleton-transport bug in tests before changing the adapter.

**Files:**
- Modify `projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts`
- Create `projects/food-app/backend/src/mcp/__tests__/multi-client-lifecycle.test.ts`

**Step 1: Add a sequential fresh-client repro**

Write a blackbox test that:
- starts the app,
- creates MCP client A,
- runs `initialize` plus one simple call,
- closes or abandons A cleanly,
- creates MCP client B,
- asserts B can also `initialize` successfully.

Suggested assertion shape:

```ts
it('allows a second fresh client to initialize after the first client lifecycle ends', async () => {
  const first = await createTestClient(baseUrl);
  await first.listTools();
  await first.close();

  const second = await createTestClient(baseUrl);
  await expect(second.listTools()).resolves.toBeDefined();
  await second.close();
});
```

**Step 2: Add a concurrent-client repro**

Write a second blackbox test that creates two clients independently and verifies both can complete initialization and at least `tools/list` without one poisoning the other.

**Step 3: Run the focused failing tests**

Run:

```bash
cd projects/food-app/backend
npx vitest run src/mcp/__tests__/http-smoke.test.ts src/mcp/__tests__/multi-client-lifecycle.test.ts
```

Expected: FAIL with `Server already initialized`, `400 Bad Request`, or equivalent transport-lifecycle failure.

---

### Task 2: Replace the singleton transport lifecycle

**Objective:** Make the `/mcp` adapter safe for repeated and independent client lifecycles.

**Files:**
- Modify `projects/food-app/backend/src/mcp/http.ts`
- Possibly modify `projects/food-app/backend/src/mcp/server.ts`

**Step 1: Choose the narrowest lifecycle-safe design**

Preferred direction:
- create a fresh `StreamableHTTPServerTransport` for each client session or request lifecycle,
- connect that transport only for the scope where it is valid,
- avoid reusing initialized transport state across unrelated clients.

If the SDK requires a server factory rather than reconnecting one shared server instance safely, introduce a `createMcpServer()` factory in `backend/src/mcp/server.ts` and make the HTTP adapter own instance creation.

**Step 2: Keep the adapter boring**

The final `http.ts` should still just:
- mount the `/mcp` method surface,
- attach the request to the correct transport instance,
- let the SDK own protocol behavior,
- clean up transport state when the lifecycle ends.

Do not bury domain logic, auth shortcuts, or custom protocol state machines in the adapter.

**Step 3: Re-run the focused lifecycle tests**

Run:

```bash
cd projects/food-app/backend
npx vitest run src/mcp/__tests__/http-smoke.test.ts src/mcp/__tests__/multi-client-lifecycle.test.ts
```

Expected: PASS.

---

### Task 3: Re-prove realistic MCP workflow behavior

**Objective:** Confirm the lifecycle fix does not merely make `initialize` pass while breaking real tool use.

**Files:**
- Modify `projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts`
- Modify `projects/food-app/backend/src/mcp/__tests__/workflow.test.ts` if it already exists, otherwise create it

**Step 1: Verify one full authenticated workflow**

The blackbox suite should prove:
- `initialize` succeeds,
- `tools/list` succeeds,
- `login` succeeds,
- one authenticated read succeeds,
- one authenticated mutation succeeds,
- a follow-up read reflects the mutation.

**Step 2: Verify workflow repeatability across fresh clients**

Run the same logical flow twice using two separate clients so the suite proves that the server handles repeated real-world consumer sessions instead of a one-shot happy path.

**Step 3: Run the MCP-specific suite**

Run:

```bash
cd projects/food-app/backend
npm run test:mcp:http
```

Expected: PASS.

---

### Task 4: Feed the architectural diagnosis back into plan docs

**Objective:** Make the existing phase plans reflect the real transport constraint instead of outdated assumptions.

**Files:**
- Modify `projects/food-app/plans/mcp-server/phase-06.md`
- Modify `projects/food-app/plans/mcp-server/phase-07.md`
- Modify `projects/food-app/plans/mcp-server/plan.md`
- Optionally modify `projects/food-app/plans/mcp-server/deliverables.md`

**Step 1: Update the top-level architecture assumption**

`plan.md` should no longer describe one long-lived singleton transport binding as acceptable. It should explicitly require a lifecycle-safe transport design.

**Step 2: Update Phase 6 expectations**

Phase 6 should explicitly require multi-client lifecycle tests, not just a single-client smoke path.

**Step 3: Update Phase 7 acceptance language**

Phase 7 should state that Hermes consumption is not proven unless a fresh Hermes client can connect successfully after prior MCP sessions have already existed.

**Step 4: Keep appendices narrow**

Do not rewrite whole phase files. Add concise appendices or addenda explaining the new diagnosis, the risk, and the required verification upgrades.

---

### Task 5: Run the verification set

**Objective:** Confirm the transport fix is real and does not regress the backend.

**Files:**
- No additional code changes expected

**Step 1: Run focused MCP transport tests**

Run:

```bash
cd projects/food-app/backend
npx vitest run src/mcp/__tests__/http-smoke.test.ts src/mcp/__tests__/multi-client-lifecycle.test.ts
npm run test:mcp:http
```

Expected: PASS.

**Step 2: Run the full backend suite**

Run:

```bash
cd projects/food-app/backend
npm test
```

Expected: PASS.

**Step 3: Run the build**

Run:

```bash
cd projects/food-app/backend
npm run build
```

Expected: PASS.

**Step 4: Re-check Hermes consumption**

Use a real Hermes MCP client against the deployed endpoint and verify:
- discovery succeeds,
- tools are registered,
- a fresh connection still works after previous sessions already existed.

This is the real acceptance gate.

---

## Validation checklist

- Singleton transport state is no longer shared across unrelated clients in `projects/food-app/backend/src/mcp/http.ts`
- Sequential fresh-client MCP tests pass
- Concurrent-client MCP tests pass
- Real authenticated MCP workflow tests pass
- `npm run test:mcp:http` passes
- `npm test` passes
- `npm run build` passes
- Hermes can discover tools from the real deployed endpoint after prior sessions already existed

## Risks and tradeoffs

- If the SDK does not support reconnecting a shared server definition cleanly, the fix will need a server factory rather than only a transport factory.
- Per-session transport or server instances may cost a bit more memory, but this is the right trade for correctness on a low-traffic service.
- A partial fix that only papers over stale sessions without proving concurrent and repeated client behavior is not good enough.
- Sticky routing may still matter in multi-instance deployment, but it is not a substitute for fixing the obvious singleton transport bug inside one process.

## Open questions

- Does `@modelcontextprotocol/sdk` expect one `McpServer` per transport instance, or can one shared server definition be connected safely many times?
- Is the deployed environment single-process today, or can Cloudflare/proxy routing still introduce cross-instance session issues after the in-process singleton fix?
- Do any existing tests silently reuse one client instance and therefore miss the real bug?

## Definition of done

This fix is done when the food-app MCP endpoint can serve repeated and concurrent fresh client lifecycles without `Server already initialized`, the backend test suite proves that behavior locally, and Hermes can once again discover and use the deployed MCP tools without requiring a backend restart.