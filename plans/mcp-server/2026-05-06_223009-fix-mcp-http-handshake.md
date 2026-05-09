# Fix MCP HTTP Handshake Implementation Plan

> **For Hermes:** plan only. Execute later in small slices. Use strict test-first behavior for transport fixes and blackbox client-driven verification.

**Goal:** Fix the food-app MCP HTTP endpoint so Hermes can reliably discover and use `mcp_food-app_*` tools over Streamable HTTP without `400 Bad Request` or `Session termination failed: 404` errors.

**Architecture:** Keep the current same-process Express + MCP design, but harden the `/mcp` transport adapter to fully implement the Streamable HTTP method surface expected by the MCP SDK client. Preserve app-level auth as stateless JWT-in-tool-input behavior; only fix protocol/session transport behavior here.

**Tech Stack:** TypeScript, Express, `@modelcontextprotocol/sdk`, Vitest, Node.js fetch, existing food-app backend test harness.

---

## Current context

- The live project is at `/home/hermes/projects/food-app`.
- The current MCP adapter in `/home/hermes/projects/food-app/backend/src/mcp/http.ts` mounts only `POST /mcp` and `GET /mcp`.
- The MCP SDK client used by Hermes sends `DELETE /mcp` to terminate sessions.
- Local repro already proved: initialize succeeds, then `DELETE /mcp` returns `404 Cannot DELETE /mcp`.
- Hermes logs already showed the matching symptom: `Session termination failed: 404`.
- The remote `400 Bad Request` is also consistent with stateful session loss or follow-up requests reaching an uninitialized transport instance.

## Problem statement

Two transport-level defects are the likely feature gap:

1. **Definite bug:** `/mcp` does not implement `DELETE`, so any standards-compliant client that terminates sessions gets a `404`.
2. **Probable deployment/runtime bug:** the transport is stateful and stores session state in memory. If the deployed endpoint is load-balanced or otherwise loses affinity, follow-up GET/POST/DELETE requests can hit a process that does not know the session and return `400`/`404`.

This feature plan fixes the first bug in code and adds enough verification to expose the second clearly.

---

## Proposed approach

- Add `DELETE /mcp` to the Express transport adapter and route it to `transport.handleRequest(req, res)`.
- Extend the transport smoke test so it proves session termination works, not just initialize/list/call.
- Add a focused regression repro test that verifies the client can connect, do one call, and close without a `404`.
- Add deployment notes documenting that stateful transport requires sticky routing or a stateless redesign.
- Keep the implementation minimal: do not redesign auth, tools, or service boundaries in this feature.

---

## Files likely to change

- Modify `/home/hermes/projects/food-app/backend/src/mcp/http.ts`
- Modify `/home/hermes/projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts`
- Possibly create `/home/hermes/projects/food-app/backend/src/mcp/__tests__/transport-termination.test.ts`
- Modify `/home/hermes/projects/food-app/plans/mcp-server/phase-06.md`
- Optionally modify `/home/hermes/projects/food-app/README.md` if operator-facing deployment notes belong there

---

## Step-by-step plan

### Task 1: Lock in the failing transport contract

**Objective:** Capture the actual failure mode in tests before changing the adapter.

**Files:**
- Modify: `/home/hermes/projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts`
- Optionally create: `/home/hermes/projects/food-app/backend/src/mcp/__tests__/transport-termination.test.ts`

**Step 1: Add a failing termination assertion**

Extend the existing smoke coverage so the test suite proves that closing the MCP client does not trigger a `404` on `DELETE /mcp`.

Suggested assertion shape:

```ts
it('client close terminates the MCP session cleanly', async () => {
  await expect(client.close()).resolves.toBeUndefined();
});
```

If `client.close()` is awkward to assert in the shared `afterAll`, move to a dedicated test file that creates its own app, client, and cleanup flow.

**Step 2: Run only the transport test**

Run:
```bash
cd /home/hermes/projects/food-app/backend
npx vitest run src/mcp/__tests__/http-smoke.test.ts
```

Expected: FAIL with a `404`-style termination error or equivalent streamable HTTP session termination failure.

**Step 3: Keep the failure message specific**

Make sure the failure output makes it obvious this is about `DELETE /mcp`, not tool logic or auth.

---

### Task 2: Implement the missing DELETE handler

**Objective:** Make the Express adapter expose the full MCP HTTP lifecycle expected by the SDK client.

**Files:**
- Modify: `/home/hermes/projects/food-app/backend/src/mcp/http.ts`

**Step 1: Add `DELETE /mcp` beside the existing GET/POST handlers**

Implementation shape:

```ts
app.delete('/mcp', async (req: Request, res: Response) => {
  if (!transport) {
    res.status(500).json({ error: 'Transport not initialized' });
    return;
  }

  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
```

**Step 2: Keep behavior consistent**

Reuse the same error handling pattern as GET/POST. Do not special-case transport semantics in Express; let the SDK transport decide whether session termination should return `200`, `400`, `404`, or `405`.

**Step 3: Re-run the focused test**

Run:
```bash
cd /home/hermes/projects/food-app/backend
npx vitest run src/mcp/__tests__/http-smoke.test.ts
```

Expected: PASS for the termination regression, or expose the next real transport issue.

---

### Task 3: Prove full transport sanity with a local blackbox repro

**Objective:** Verify that the real MCP client lifecycle works end-to-end against the local Express app.

**Files:**
- Modify: `/home/hermes/projects/food-app/backend/src/mcp/__tests__/http-smoke.test.ts`
- Possibly create: `/home/hermes/projects/food-app/backend/src/mcp/__tests__/transport-termination.test.ts`

**Step 1: Cover the full lifecycle**

The local blackbox sequence should prove:
- `initialize` succeeds
- `tools/list` succeeds
- at least one `tools/call` succeeds
- `client.close()` succeeds cleanly

**Step 2: Run the dedicated MCP transport suite**

Run:
```bash
cd /home/hermes/projects/food-app/backend
npm run test:mcp:http
```

Expected: PASS.

**Step 3: Guard against false positives**

If the suite passes only because `client.close()` errors are swallowed, tighten the assertion so shutdown failures fail the suite explicitly.

---

### Task 4: Document the deployment constraint behind the remaining 400 risk

**Objective:** Turn the remote `400` from a vague symptom into an explicit operator requirement.

**Files:**
- Modify: `/home/hermes/projects/food-app/plans/mcp-server/phase-06.md`
- Optionally modify: `/home/hermes/projects/food-app/README.md`

**Step 1: Document stateful transport assumptions**

Add a short note that the current Streamable HTTP server transport is stateful:
- session IDs are stored in process memory
- repeated requests for one session must hit the same backend process
- non-sticky load balancing or proxy fan-out can produce `Bad Request: Server not initialized`, `Bad Request: Mcp-Session-Id header is required`, or `Session not found`

**Step 2: Document acceptable operator fixes**

List the realistic options:
- sticky routing / affinity for `/mcp`
- single backend instance for MCP traffic
- future redesign to stateless transport or shared session storage

**Step 3: Keep the docs narrow**

Do not rewrite the whole MCP architecture section. Add only the deployment constraint discovered here.

---

### Task 5: Run the full verification set

**Objective:** Confirm the fix does not regress the existing backend or MCP test surface.

**Files:**
- No code changes expected

**Step 1: Run focused MCP tests**

Run:
```bash
cd /home/hermes/projects/food-app/backend
npx vitest run src/mcp/__tests__/http-smoke.test.ts
npm run test:mcp:http
```

Expected: PASS.

**Step 2: Run full backend tests**

Run:
```bash
cd /home/hermes/projects/food-app/backend
npm test
```

Expected: PASS.

**Step 3: Run build**

Run:
```bash
cd /home/hermes/projects/food-app/backend
npm run build
```

Expected: PASS.

**Step 4: Optional manual repro**

Run a tiny local script or one-off Node probe that performs initialize then DELETE to confirm the previous `Cannot DELETE /mcp` behavior is gone.

---

## Validation checklist

- `DELETE /mcp` is mounted in `/home/hermes/projects/food-app/backend/src/mcp/http.ts`
- A real MCP HTTP client can initialize, call tools, and close cleanly
- Focused MCP transport tests pass
- Full backend tests pass
- Build passes
- Docs mention the stateful transport deployment constraint if remote `400`s remain possible

## Risks and tradeoffs

- Adding `DELETE` fixes the local protocol mismatch, but it does not magically solve remote multi-instance/session-affinity problems.
- The current singleton transport design may still be fragile under some deployment topologies even if local tests pass.
- A larger redesign to stateless transport would reduce deployment risk, but it is outside the scope of this feature unless the focused fix fails.

## Open questions

- Is the remote `https://food.pashutk.com/mcp` deployment single-instance, or is Cloudflare/proxying distributing requests across processes?
- Is there any edge middleware stripping or rewriting `mcp-session-id` headers before requests hit Express?
- Should MCP traffic eventually move to a stateless mode for simpler operations, or is sticky routing acceptable here?

## Definition of done

This feature is done when the backend correctly handles `DELETE /mcp`, the local MCP client lifecycle passes cleanly in tests, and the remaining remote `400` risk is documented as a deployment/session-affinity concern rather than left as an unexplained failure.
