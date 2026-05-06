#!/usr/bin/env node
// MCP Server Verification Script
// Proves the full Hermes consumption flow against a live backend.
//
// Usage: npx tsx scripts/verify-mcp.mjs [BASE_URL]
// Exit code 0 = all checks passed, 1 = failed

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE_URL = process.argv[2] || 'http://localhost:3000/mcp';
const USERNAME = process.env.AUTH_USERNAME || 'testuser';
const PASSWORD = process.env.AUTH_PASSWORD || 'testpass';

let passed = 0, failed = 0;
function check(name, ok) { console.log(ok ? `✓ ${name}` : `✗ ${name}`); ok ? passed++ : failed++; }

async function main() {
  console.log(`Connecting to ${BASE_URL}...`);

  const transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
  const client = new Client({ name: 'verify', version: '0.1.0' }, { capabilities: {} });
  await client.connect(transport);

  // 1. Tools list
  const tools = await client.listTools();
  check('tools/list returns all 9 tools', tools.tools.length === 9);
  console.log(`  Found: ${tools.tools.map(t => t.name).join(', ')}`);

  // 2. Login
  const login = await client.callTool({ name: 'login', arguments: { username: USERNAME, password: PASSWORD } });
  const loginData = JSON.parse(login.content[0].text);
  check('login returns JWT token', loginData.status === 'ok' && loginData.token);
  const token = loginData.token;

  // 3. Browse dishes (authenticated read)
  const browse = await client.callTool({ name: 'browse_dishes', arguments: { auth: { token } } });
  const browseData = JSON.parse(browse.content[0].text);
  check('browse_dishes returns dishes', Array.isArray(browseData.dishes));
  console.log(`  Dishes: ${browseData.dishes.length}`);

  // 4. Update menu (authenticated mutation)
  const today = new Date().toISOString().split('T')[0];
  const menu = await client.callTool({
    name: 'update_menu',
    arguments: { auth: { token }, date: today, entries: [{ dish: 'Verification Test' }] }
  });
  const menuData = JSON.parse(menu.content[0].text);
  check('update_menu returns date and entries', menuData.date === today && Array.isArray(menuData.entries));

  await client.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log('VERIFICATION FAILED'); process.exit(1); }
  console.log('VERIFICATION PASSED');
}

main().catch(e => { console.error(`Error: ${e.message}`); process.exit(1); });
