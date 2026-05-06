#!/usr/bin/env node
/**
 * MCP Operator Smoke Script
 *
 * Quick manual verification that the MCP endpoint is healthy.
 * Connects, initializes, logs in, calls one read tool, prints success/failure.
 * Exit 0 on success, non-zero on failure.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE_URL = process.env.MCP_URL || 'http://localhost:3000/mcp';

async function smoke() {
  let client;
  try {
    // Step 1: Connect and initialize
    console.log(`Connecting to ${BASE_URL}...`);
    const transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
    client = new Client(
      { name: 'smoke-script', version: '0.1.0' },
      { capabilities: {} }
    );
    await client.connect(transport);
    console.log('✓ initialize succeeded');

    // Step 2: tools/list
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    console.log(`✓ tools/list returned ${toolNames.length} tools`);

    // Step 3: Login
    const loginResult = await client.callTool({
      name: 'login',
      arguments: {
        username: process.env.MCP_USERNAME || 'testuser',
        password: process.env.MCP_PASSWORD || 'testpass',
      },
    });
    const loginText = (loginResult.content)[0].text;
    const loginData = JSON.parse(loginText);
    if (loginData.status !== 'ok') {
      throw new Error(`Login failed: ${loginData.error}`);
    }
    const token = loginData.token;
    console.log('✓ login succeeded');

    // Step 4: Authenticated read
    const readResult = await client.callTool({
      name: 'browse_dishes',
      arguments: { auth: { token } },
    });
    const readText = (readResult.content)[0].text;
    const readData = JSON.parse(readText);
    if (readData.error) {
      throw new Error(`browse_dishes failed: ${readData.error}`);
    }
    console.log(`✓ browse_dishes returned ${readData.dishes?.length ?? 0} dishes`);

    console.log('\n✓ MCP endpoint is healthy');
    process.exit(0);
  } catch (error) {
    console.error(`✗ MCP smoke test failed: ${error.message}`);
    process.exit(1);
  } finally {
    if (client) {
      try { await client.close(); } catch (_) {}
    }
  }
}

smoke();