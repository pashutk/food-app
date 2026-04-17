# food-app MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the food-app API as MCP tools, allowing AI assistants to manage dishes, menus, and shopping lists.

## Prerequisites

- Node.js 18+
- A running [food-app](https://github.com/pashutk/food-app) backend instance

## Setup

```bash
cd mcp-server
npm install
npm run build
```

## Configuration

The server reads the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `API_BASE_URL` | **Yes** | Base URL of the food-app backend (e.g. `http://localhost:3000`) |
| `AUTH_EMAIL` | No | Username for auto-login on startup |
| `AUTH_PASSWORD` | No | Password for auto-login on startup |

Copy the example file and fill in your values:

```bash
cp ../.env.example .env
# edit .env
```

## Running

### Development (no build step)

```bash
npx tsx src/index.ts
```

Or with env vars inline:

```bash
API_BASE_URL=http://localhost:3000 AUTH_EMAIL=user AUTH_PASSWORD=secret npx tsx src/index.ts
```

### Production (after `npm run build`)

```bash
node dist/index.js
```

### Via MCP config (Claude Desktop / Claude Code)

Add to your MCP settings (e.g. `~/.claude/mcp_settings.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "food-app": {
      "command": "node",
      "args": ["/path/to/food-app-mcp/mcp-server/dist/index.js"],
      "env": {
        "API_BASE_URL": "http://localhost:3000",
        "AUTH_EMAIL": "your-username",
        "AUTH_PASSWORD": "your-password"
      }
    }
  }
}
```

## Available Tools

### `auth_login`
Authenticate with the food-app and store the JWT token. Called automatically on startup if `AUTH_EMAIL` and `AUTH_PASSWORD` are set.

**Parameters:**
- `username` (optional) — falls back to `AUTH_EMAIL` env var
- `password` (optional) — falls back to `AUTH_PASSWORD` env var

---

### `list_dishes`
List all dishes with optional filters.

**Parameters:**
- `tag` (optional) — filter by meal tag: `breakfast | lunch | dinner | snack | dessert | drink`
- `takeout` (optional) — filter by takeout status (`true` / `false`)

---

### `create_dish`
Create a new dish.

**Parameters:**
- `name` (required)
- `tags` (optional) — array of meal tags
- `takeout` (optional, default `false`)
- `ingredients` (optional) — array of `{ name, quantity, unit }`
- `instructions` (optional)
- `notes` (optional)

---

### `update_dish`
Update an existing dish by ID.

**Parameters:** same as `create_dish` plus `id` (required)

---

### `delete_dish`
Delete a dish by ID.

**Parameters:**
- `id` (required)

---

### `import_dishes`
Bulk import dishes from a JSON array. The import is transactional — it fails entirely if any dish name already exists (case-insensitive).

**Parameters:**
- `dishes` (required) — array of dish objects (same shape as `create_dish`)

---

### `get_menu`
Get the menu for a specific date.

**Parameters:**
- `date` (required) — `YYYY-MM-DD`

---

### `set_menu`
Replace the entire menu for a date.

**Parameters:**
- `date` (required) — `YYYY-MM-DD`
- `entries` (required) — array of `{ slot, dishId, servings }` where `slot` is `breakfast | lunch | dinner | snack`

---

### `add_dish_to_menu`
Add (or replace) a dish in a specific meal slot on a date.

**Parameters:**
- `date` (required) — `YYYY-MM-DD`
- `slot` (required) — `breakfast | lunch | dinner | snack`
- `dishId` (required) — dish ID
- `servings` (optional, default `1`)

---

### `remove_dish_from_menu`
Remove a dish from a meal slot on a date.

**Parameters:**
- `date` (required) — `YYYY-MM-DD`
- `slot` (required) — `breakfast | lunch | dinner | snack`

---

### `get_shopping_list`
Generate a shopping list for a date by aggregating ingredients from all non-takeout dishes in the menu. Quantities are scaled by servings and duplicate ingredients (same name + unit, case-insensitive) are merged.

**Parameters:**
- `date` (required) — `YYYY-MM-DD`

**Returns:** sorted array of `{ name, quantity, unit }`

## Authentication Notes

- If `AUTH_EMAIL` and `AUTH_PASSWORD` are set, the server auto-authenticates on startup.
- The token is held in memory for the lifetime of the server process. If it expires (30 days), call `auth_login` again.
- All tools except `auth_login` require a valid token. If not authenticated, they return an error message prompting you to call `auth_login`.
