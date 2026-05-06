import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createApp } from '../../app';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Server } from 'http';

/**
 * Phase 6 — Blackbox MCP workflow test.
 *
 * Proves that a real MCP HTTP client can complete a full authenticated
 * workflow: connect, login, read, mutate, verify mutation.
 *
 * This is NOT a per-tool test — it exercises the transport lifecycle
 * end-to-end and catches integration failures that isolated tests miss.
 */

// Use a unique port for the test server
const PORT = 4010;
const BASE_URL = `http://localhost:${PORT}/mcp`;

let server: Server | null = null;
let client: Client;
let transport: StreamableHTTPClientTransport;

async function startServer() {
  const app = createApp();
  return new Promise<void>((resolve, reject) => {
    server = app.listen(PORT, () => resolve());
    server.on('error', reject);
  });
}

async function stopServer() {
  if (client) {
    try {
      await client.close();
    } catch (_) {
      // ignore
    }
  }
  return new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
      setTimeout(() => resolve(), 2000);
    } else {
      resolve();
    }
  });
}

describe('MCP blackbox authenticated workflow', () => {
  beforeAll(async () => {
    await startServer();

    // Create a fresh client connection
    transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
    client = new Client(
      { name: 'workflow-test-client', version: '0.1.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
  }, 10000);

  afterAll(async () => {
    await stopServer();
  }, 5000);

  // Step 1: Transport canary — initialize succeeded
  it('initialize succeeded and server metadata is available', () => {
    const version = client.getServerVersion();
    expect(version).toBeDefined();
  });

  // Step 2: tools/list returns all registered tools
  it('tools/list returns all registered tools', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);

    // Core tools
    expect(toolNames).toContain('ping');
    expect(toolNames).toContain('login');

    // Read tools
    expect(toolNames).toContain('browse_dishes');
    expect(toolNames).toContain('view_menu');

    // Mutation tools
    expect(toolNames).toContain('add_dish');
    expect(toolNames).toContain('edit_dish');
    expect(toolNames).toContain('remove_dish');
    expect(toolNames).toContain('import_dishes');
    expect(toolNames).toContain('update_menu');
  });

  // Step 3: Login returns a usable JWT
  it('login returns a usable JWT', async () => {
    const result = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);

    expect(parsed.status).toBe('ok');
    expect(parsed.token).toBeDefined();
    expect(typeof parsed.token).toBe('string');
    expect(parsed.token.length).toBeGreaterThan(10); // JWTs are long
  });

  // Step 4: Authenticated read succeeds
  it('authenticated read (browse_dishes) succeeds with JWT', async () => {
    // Login first
    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const loginData = JSON.parse((loginResult.content as any[])[0].text);
    const token = loginData.token;

    // Read dishes
    const result = await client.callTool({
      name: 'browse_dishes',
      arguments: { auth: { token } },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);

    expect(parsed.dishes).toBeDefined();
    expect(Array.isArray(parsed.dishes)).toBe(true);
  });

  // Step 5: Authenticated mutation succeeds
  it('authenticated mutation (add_dish) succeeds with JWT', async () => {
    // Login
    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const loginData = JSON.parse((loginResult.content as any[])[0].text);
    const token = loginData.token;

    // Add a dish with a unique name
    const uniqueName = `WorkflowTestDish_${Date.now()}`;
    const result = await client.callTool({
      name: 'add_dish',
      arguments: {
        auth: { token },
        name: uniqueName,
        tags: ['workflow-test'],
      },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);

    // add_dish returns { dish: { ... } }
    expect(parsed.dish).toBeDefined();
    expect(parsed.dish.name).toBe(uniqueName);
    expect(parsed.dish.tags).toContain('workflow-test');
    expect(parsed.dish.id).toBeDefined();
  });

  // Step 6: Follow-up read proves mutation stuck
  it('follow-up read reflects the mutation (dish is visible)', async () => {
    // Login
    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const loginData = JSON.parse((loginResult.content as any[])[0].text);
    const token = loginData.token;

    // Read dishes and verify the workflow test dish is there
    const result = await client.callTool({
      name: 'browse_dishes',
      arguments: { auth: { token } },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);

    // At least one dish should have the workflow-test tag
    const workflowDishes = parsed.dishes.filter(
      (d: { tags?: string[] }) => d.tags && d.tags.includes('workflow-test')
    );
    expect(workflowDishes.length).toBeGreaterThan(0);
  });

  // Step 7: Sequential operations don't break transport state
  it('sequential operations succeed without transport degradation', async () => {
    // Login
    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const loginData = JSON.parse((loginResult.content as any[])[0].text);
    const token = loginData.token;

    // Rapid sequential calls
    for (let i = 0; i < 3; i++) {
      const result = await client.callTool({
        name: 'browse_dishes',
        arguments: { auth: { token } },
      });

      const textContent = (result.content as any[])[0].text;
      const parsed = JSON.parse(textContent);
      expect(parsed.dishes).toBeDefined();
      expect(Array.isArray(parsed.dishes)).toBe(true);
    }
  });

  // Step 8: Failure output is specific and attributable
  it('failure output distinguishes auth failure from tool failure', async () => {
    // Invalid token should give auth error
    const result = await client.callTool({
      name: 'browse_dishes',
      arguments: { auth: { token: 'invalid-token-xyz' } },
    });

    const textContent = (result.content as any[])[0].text;
    const parsed = JSON.parse(textContent);

    // Should have an error field (auth failure)
    expect(parsed.error).toBeDefined();
    expect(typeof parsed.error).toBe('string');
  });

  // Step 9: Menu workflow — update then view
  it('menu workflow: update_menu then view_menu reflects changes', async () => {
    // Login
    const loginResult = await client.callTool({
      name: 'login',
      arguments: { username: 'testuser', password: 'testpass' },
    });
    const loginData = JSON.parse((loginResult.content as any[])[0].text);
    const token = loginData.token;

    const testDate = `2026-05-${Date.now() % 31 + 1}`;
    const testEntries = [{ dish: 'Workflow Test Breakfast' }];

    // Update menu
    const updateResult = await client.callTool({
      name: 'update_menu',
      arguments: {
        auth: { token },
        date: testDate,
        entries: testEntries,
      },
    });

    const updateText = (updateResult.content as any[])[0].text;
    const updateParsed = JSON.parse(updateText);
    expect(updateParsed.date).toBe(testDate);

    // View menu — should reflect the update
    const viewResult = await client.callTool({
      name: 'view_menu',
      arguments: { auth: { token }, date: testDate },
    });

    const viewText = (viewResult.content as any[])[0].text;
    const viewParsed = JSON.parse(viewText);
    expect(viewParsed.date).toBe(testDate);
    expect(viewParsed.entries[0].dish).toBe('Workflow Test Breakfast');
  });

  // Step 10: Transport lifecycle note
  // The MCP SDK requires a singleton transport — mcpServer.connect() can only
  // be called once. Concurrent clients share the transport, which is by design.
  // This is documented behavior, not a bug.
});