# MCP Server 400 Bad Request — Diagnosis Report

> **Date:** 2026-05-08  
> **Issue:** Hermes MCP client fails to connect to `https://food.pashutk.com/mcp` with `400 Bad Request`  
> **Status:** Diagnosed, fix pending

---

## Symptom

Hermes agent logs show repeated connection failures:

```
2026-05-07 20:43:44 WARNING TOOLS.MCP_TOOL: MCP SERVER 'FOOD-APP' INITIAL CONNECTION FAILED (ATTEMPT 1/3)
2026-05-07 20:43:51 WARNING TOOLS.MCP_TOOL: FAILED TO CONNECT TO MCP SERVER 'FOOD-APP': 
  CLIENT ERROR '400 BAD REQUEST' FOR URL 'HTTPS://FOOD.PASHUTK.COM/MCP'
2026-05-07 20:43:51 INFO TOOLS.MCP_TOOL: MCP: REGISTERED 0 TOOL(S) FROM 0 SERVER(S) (1 FAILED)
```

## Root Cause

**Direct curl confirms the 400 response:**

```bash
curl -X POST "https://food.pashutk.com/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize",...}'
```

**Response:**
```
HTTP 400
{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request: Server already initialized"},"id":null}
```

**The server rejects the `initialize` handshake because the transport is already in an "initialized" state from a previous client session.**

### Architecture

Current implementation in `backend/src/mcp/http.ts`:

```typescript
let transport: StreamableHTTPServerTransport | null = null;  // ← singleton

export function mountMCP(app: Express) {
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => require('crypto').randomUUID(),
  });
  
  mcpServer.connect(transport);  // ← called once at startup
  
  app.post('/mcp', async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });
  // ... GET, DELETE
}
```

**Problem:** The singleton transport maintains initialization state across all requests. Once any client completes the `initialize` handshake, subsequent `initialize` calls from other clients are rejected with "Server already initialized."

### Lifecycle

1. Backend starts → creates one transport, calls `mcpServer.connect(transport)` once
2. Client A connects → sends `initialize` → transport marks itself as initialized → ✅ works
3. Client A disconnects (timeout, crash, or explicit close) → transport state is NOT reset
4. Client B (Hermes) connects → sends `initialize` → transport rejects → **400 Bad Request**

### Why it happens

- **Stale sessions:** Previous client sessions leave the transport in an initialized state
- **No session cleanup:** The transport doesn't auto-reset when a client disconnects
- **Singleton anti-pattern for stateful transports:** One transport instance cannot serve multiple independent client lifecycles

## Impact

- **Hermes cannot discover or use any food-app MCP tools** — 0 tools registered
- Any new MCP client attempting to connect after an existing session ends will fail
- Only works reliably on first connection after server restart

## Fix Options

### Option A: Per-session transports (Recommended)

Create a fresh transport + server pair for each client session:

```typescript
export function mountMCP(app: Express) {
  app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => require('crypto').randomUUID(),
    });
    
    const server = createMcpServer();  // fresh instance per session
    server.connect(transport);
    
    await transport.handleRequest(req, res, req.body);
  });
}
```

**Pros:** Each client gets its own isolated session, no state leakage  
**Cons:** Higher memory usage per concurrent client (acceptable for low-traffic service)

### Option B: Restart backend (Temporary workaround)

```bash
# Restart clears the singleton state
docker restart food-app-backend
# or
systemctl restart food-app
```

**Pros:** Immediate, no code change  
**Cons:** Loses all active sessions, problem recurs on next stale session

### Option C: Transport state management (Advanced)

Add explicit session lifecycle management — detect when a session becomes stale and reset the transport. Requires understanding the SDK's internal session tracking.

**Pros:** Keeps singleton pattern  
**Cons:** Complex, error-prone, fights the SDK's design

## Files to modify

- `backend/src/mcp/http.ts` — transport lifecycle logic
- `backend/src/mcp/server.ts` — may need `createMcpServer()` factory function
- `backend/src/mcp/__tests__/http-smoke.test.ts` — add multi-client concurrent test

## Verification

After fix, verify:

1. **Single client lifecycle:** connect → initialize → tools/list → call → close → ✅
2. **Second client after first closes:** connect → initialize → ✅ (was failing)
3. **Concurrent clients:** two clients connect simultaneously → both initialize → ✅

## Related

- Phase 6 plan: `plans/mcp-server/2026-05-06_223009-fix-mcp-http-handshake.md` (DELETE handler fix)
- Phase 7 plan: `plans/mcp-server/phase-07.md` (Hermes consumption check)
- Known deployment constraint: stateful transport requires sticky sessions or per-session architecture

## Decision

**Recommended:** Implement Option A (per-session transports). This is the correct architectural fix — the singleton pattern is fundamentally incompatible with the MCP StreamableHTTP protocol's session model.

**Next step:** Update `http.ts` to create transports per session, add multi-client tests, deploy, verify Hermes connects successfully.
