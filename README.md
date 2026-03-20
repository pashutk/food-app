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
