/**
 * MCP Server Verification Script
 *
 * Proves the full Hermes consumption flow against a live backend:
 * 1. tools/list — discovers all tools
 * 2. login — returns JWT token
 * 3. browse_dishes — authenticated read works
 * 4. update_menu — authenticated mutation works
 *
 * Usage:
 *   # Start backend first: npm run dev
 *   # Then run verification:
 *   npx tsx scripts/verify-mcp.mjs [BASE_URL]
 *
 * Exit code 0 = all checks passed
 * Exit code 1 = verification failed
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE_URL = process.argv[2] || 'http://localhost:3000/mcp';
const USERNAME = process.env.AUTH_USERNAME || 'testuser';
const PASSWORD = process.env.AUTH_PASSWORD || 'testpass';

let token = null;
let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}`);
    failed++;
  }
}

async function main() {
  console.log(`Connecting to ${BASE_URL}...`);

  const transport = new StreamableHTTPClientTransport(new URL(BASE_URL));
  const client = new Client(
    { name: 'mcp-verification', version: '0.1.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  // 1. List tools
  const tools = await client.listTools();
  const toolNames = tools.tools.map(t => t.name);
  check('tools/list returns all 9 tools', toolNames.length === 9);
  console.log(`  Tools: ${toolNames.join(', ')}`);

  // 2. Login
  const loginResult = await client.callTool({
    name: 'login',
    arguments: { username: USERNAME, password: PASSWORD }
  });
  const loginData = JSON.parse(loginResult.content[0].text);
  check('login returns JWT token', loginData.status === 'ok' && loginData.token);
  token = loginData.token;

  // 3. Browse dishes (authenticated read)
  const browseResult = await client.callTool({
    name: 'browse_dishes',
    arguments: { auth: { token } }
  });
  const browseData = JSON.parse(browseResult.content[0].text);
  check('browse_dishes returns dishes array', Array.isArray(browseData.dishes));
  console.log(`  Dishes: ${browseData.dishes?.length || 0}`);

  // 4. Update menu (authenticated mutation)
  const today = new Date().toISOString().split('T')[0];
  const testEntries = [{ dish: 'Verification Test' }];
  const menuResult = await client.callTool({
    name: 'update_menu',
    arguments: {
      auth: { token },
      date: today,
      entries: testEntries
    }
  });
  const menuData = JSON.parse(menuResult.content[0].text);
  check('update_menu returns date and entries',
    menuData.date === today && Array.isArray(menuData.entries));

  // 5. Verify the menu was actually updated
  const viewResult = await client.callTool({
    name: 'view_menu',
    arguments: { auth: { token }, date: today }
  });
  const viewData = JSON.parse(viewResult.content[0].text);
  check('view_menu confirms menu was updated',
    viewData.date === today && viewData.entries[0]?.dish === 'Verification Test');

  await client.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('VERIFICATION PASSED');
  }
}

main().catch(e => {
  console.error(`Verification error: ${e.message}`);
  process.exit(1);
});
