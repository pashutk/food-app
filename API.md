# API

All routes live under `/api`. All MCP operations are exposed as tools with the names shown below. Every operation except `login` requires authentication.

Protected MCP tools require an `auth` object:

```json
{
  "auth": {
    "token": "jwt-token"
  }
}
```

## `login`

- Purpose: authenticate and receive a JWT for protected REST and MCP access.
- REST: `POST /api/auth/login`
- MCP: `login`
- Input:

```json
{
  "username": "testuser",
  "password": "testpass"
}
```

- Output:

```json
{
  "token": "jwt-token"
}
```

- Auth: public

## Dishes

### `browse_dishes`

- Purpose: list all registered dishes.
- REST: `GET /api/dishes`
- MCP: `browse_dishes`
- Input: none
- Output:

```json
[
  {
    "id": 1,
    "name": "Coconut chicken curry",
    "tags": ["dinner"],
    "takeout": false,
    "ingredients": [],
    "instructions": "",
    "notes": "",
    "created_at": "...",
    "updated_at": "..."
  }
]
```

- Auth: protected

### `add_dish`

- Purpose: create a dish.
- REST: `POST /api/dishes`
- MCP: `add_dish`
- Input:

```json
{
  "name": "Coconut chicken curry",
  "tags": ["dinner"],
  "takeout": false,
  "ingredients": [],
  "instructions": "",
  "notes": ""
}
```

- REST output:

```json
{
  "id": 1,
  "name": "Coconut chicken curry",
  "tags": ["dinner"],
  "takeout": false,
  "ingredients": [],
  "instructions": "",
  "notes": "",
  "created_at": "...",
  "updated_at": "..."
}
```

- MCP output:

```json
{
  "mealLog": {
    "id": 1,
    "date": "2026-07-10",
    "dishId": 1,
    "slot": "dinner",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

- Auth: protected

### `edit_dish`

- Purpose: update an existing dish.
- REST: `PUT /api/dishes/:id`
- MCP: `edit_dish`
- Input:

```json
{
  "id": "1",
  "name": "Updated curry",
  "tags": ["dinner"],
  "takeout": false,
  "ingredients": [],
  "instructions": "",
  "notes": ""
}
```

- Output: same shape as `add_dish`
- Auth: protected

### `remove_dish`

- Purpose: delete a dish when it is not referenced by meal history.
- REST: `DELETE /api/dishes/:id`
- MCP: `remove_dish`
- Input:

```json
{
  "id": "1"
}
```

- Output:

```json
{
  "success": true
}
```

- Auth: protected

### `import_dishes`

- Purpose: bulk import dishes.
- REST: `POST /api/dishes/import`
- MCP: `import_dishes`
- Input:

```json
[
  {
    "name": "Oatmeal with berries",
    "tags": ["breakfast"],
    "takeout": false,
    "ingredients": [],
    "instructions": "",
    "notes": ""
  }
]
```

- Output:

```json
{
  "imported": 1
}
```

- Auth: protected

## Menus

### `view_menu`

- Purpose: fetch the planned menu for one day.
- REST: `GET /api/menus/:date`
- MCP: `view_menu`
- Input:

```json
{
  "date": "2026-07-10"
}
```

- Output:

```json
{
  "date": "2026-07-10",
  "entries": [
    {
      "slot": "dinner",
      "dishId": 1,
      "servings": 1
    }
  ]
}
```

- Auth: protected

### `update_menu`

- Purpose: create or replace the planned menu for one day.
- REST: `PUT /api/menus/:date`
- MCP: `update_menu`
- Input:

```json
{
  "date": "2026-07-10",
  "entries": [
    {
      "slot": "dinner",
      "dishId": 1,
      "servings": 1
    }
  ]
}
```

- Output: same shape as `view_menu`
- Auth: protected

## Meal Logs

### `log_meal`

- Purpose: record that a registered dish actually happened on a date.
- REST: `POST /api/meal-logs`
- MCP: `log_meal`
- Input:

```json
{
  "date": "2026-07-10",
  "dishId": 1,
  "slot": "dinner"
}
```

- Output:

```json
{
  "id": 1,
  "date": "2026-07-10",
  "dishId": 1,
  "slot": "dinner",
  "created_at": "...",
  "updated_at": "..."
}
```

- Auth: protected

### `view_meal_logs`

- Purpose: list the logged meals for one day.
- REST: `GET /api/meal-logs?date=2026-07-10`
- MCP: `view_meal_logs`
- Input:

```json
{
  "date": "2026-07-10"
}
```

- REST output:

```json
[
  {
    "id": 1,
    "date": "2026-07-10",
    "dishId": 1,
    "slot": "dinner",
    "dish": {
      "id": 1,
      "name": "Coconut chicken curry"
    },
    "created_at": "...",
    "updated_at": "..."
  }
]
```

- MCP output:

```json
{
  "mealLogs": [
    {
      "id": 1,
      "date": "2026-07-10",
      "dishId": 1,
      "slot": "dinner",
      "dish": {
        "id": 1,
        "name": "Coconut chicken curry"
      },
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

- Auth: protected

### `remove_meal_log`

- Purpose: delete a meal log.
- REST: `DELETE /api/meal-logs/:id`
- MCP: `remove_meal_log`
- Input:

```json
{
  "id": "1"
}
```

- Output:

```json
{
  "success": true
}
```

- Auth: protected
