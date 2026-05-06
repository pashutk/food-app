# Food & Menu Manager

Personal web app for planning daily menus, managing a dish library, and generating shopping lists.

## Features

- **Menu builder** — assign dishes to meal slots (breakfast/lunch/dinner/snack) for any day
- **Dish library** — manage dishes with ingredients, recipes, and meal tags; supports takeout dishes (no ingredients)
- **Shopping list** — auto-aggregated from the day's menu, skips takeout dishes
- **Dish import** — bulk import from JSON

## Stack

- Backend: Node.js + Express + SQLite (better-sqlite3)
- Frontend: Vanilla TypeScript + Vite + Tailwind CSS v4
- Auth: single user, JWT (30-day tokens)

## Deployment

The Docker image is built and pushed to GitHub Container Registry on every push to `main`:

```
ghcr.io/pashutk/food-app:latest
```

### Server setup

1. Create a GitHub personal access token with `read:packages` scope at https://github.com/settings/tokens

2. Log in to the registry on your server:
   ```sh
   docker login ghcr.io -u <github-username> -p <your-token>
   ```

3. Create a working directory with a `.env` file:
   ```sh
   mkdir food-app && cd food-app
   ```

   **.env**
   ```env
   PORT=3000
   DB_PATH=/app/data/food.db
   JWT_SECRET=<long random string>
   AUTH_USERNAME=<your username>
   AUTH_PASSWORD=<your password>
   ```

4. Create a `docker-compose.yml`:
   ```yaml
   services:
     app:
       image: ghcr.io/pashutk/food-app:latest
       ports:
         - "3000:3000"
       volumes:
         - ./data:/app/data
       env_file: .env
       restart: unless-stopped
   ```

5. Start:
   ```sh
   docker compose up -d
   ```

The app is now available on port 3000. Data is persisted in `./data/food.db`.

### Updating

```sh
docker compose pull && docker compose up -d
```

## Local development

**Backend:**
```sh
cd backend
cp .env.example .env   # fill in values
npm install
npm run dev            # starts on :3000
```

**Frontend:**
```sh
cd frontend
npm install
npm run dev            # starts on :5173, proxies /api to :3000
```

## MCP Server

The backend exposes an MCP (Model Context Protocol) server at the `/mcp` endpoint using StreamableHTTP transport. This allows LLM agents (such as Hermes) to interact with the food app programmatically.

### Endpoint

```
POST /mcp   — JSON-RPC request/response
GET  /mcp   — SSE event stream for server notifications
```

### Transport Caveat

The StreamableHTTP transport requires the client to send **both** `application/json` and `text/event-stream` in the `Accept` header. The `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` handles this automatically. If you are making raw HTTP requests, make sure both MIME types are present.

### Available Tools

| Tool | Auth Required | Parameters | Description |
|------|:---:|------------|-------------|
| `ping` | No | `message?` (string) | Health check; echoes message back with timestamp |
| `login` | No | `username` (string), `password` (string) | Authenticate and receive a JWT token |
| `browse_dishes` | Yes | `auth.token` (string) | List all dishes |
| `view_menu` | Yes | `auth.token` (string), `date` (YYYY-MM-DD) | View menu for a specific date |
| `add_dish` | Yes | `auth.token`, `name`, `tags?`, `takeout?`, `ingredients?`, `instructions?`, `notes?` | Create a new dish |
| `edit_dish` | Yes | `auth.token`, `id`, `name`, `tags?`, `takeout?`, `ingredients?`, `instructions?`, `notes?` | Update an existing dish |
| `remove_dish` | Yes | `auth.token`, `id` (string) | Delete a dish by ID |
| `import_dishes` | Yes | `auth.token`, `items` (array of dish objects) | Bulk import dishes; fails if any name already exists |
| `update_menu` | Yes | `auth.token`, `date` (YYYY-MM-DD), `entries` (array) | Create or replace menu entries for a date |

### Auth Flow

Food-app auth is **app-level**, not transport-level. The `headers` config option (if you add it) is for transport authentication; food-app uses tool-level auth instead:

1. Call `login` with your `username` and `password` (as configured in `.env` via `AUTH_USERNAME` / `AUTH_PASSWORD`).
2. The response contains a JWT `token`.
3. Pass the token as `auth.token` in every subsequent call to protected tools.

**Do not** rely on `headers` for food-app authentication — the `login` tool is the entry point.

### Example Flow

```
1. login(username="admin", password="secret")
   → { status: "ok", token: "eyJhbGci..." }

2. browse_dishes(auth={ token: "eyJhbGci..." })
   → { dishes: [ { id: "abc1", name: "Pasta", ... }, ... ] }

3. update_menu(
     auth={ token: "eyJhbGci..." },
     date="2026-05-06",
     entries=[{ meal: "lunch", dish_id: "abc1" }]
   )
   → { menu: { date: "2026-05-06", entries: [...] } }
```

### Hermes Configuration

Add the MCP server to `~/.hermes/config.yaml` under `mcp_servers`:

```yaml
mcp_servers:
  food-app:
    url: "http://localhost:3000/mcp"
```

Replace `http://localhost:3000` with your deployed instance URL. For remote servers with authentication, use `headers`:

```yaml
mcp_servers:
  food-app:
    url: "https://food-app.example.com/mcp"
    headers:
      Authorization: "Bearer sk-..."
    timeout: 180
```

Tools will be registered as `mcp_food-app_ping`, `mcp_food-app_login`, `mcp_food-app_browse_dishes`, etc.
