# Meal Logs Feature Plan

## Goal

Track which registered dishes actually happened on a given date.

This feature is the foundation for future repetition avoidance and suggestion quality, but those future behaviors are out of scope for this implementation. The v1 feature only records and displays meal history.

## Product Decisions

- A meal log record is the event. There is no `prepared`, `eaten`, `ordered`, or `completed` status field.
- Only registered dishes can be logged. If the dish does not exist yet, the user must create it first.
- Logs are separate from planned menus. A menu entry means "planned"; a meal log means "actually happened."
- Saving or editing a planned menu must not automatically create meal logs.
- A log may optionally have a meal slot.
- Existing slots should be reused: `breakfast`, `lunch`, `dinner`, and `snack`.
- Slot is nullable so users can log meals quickly at the end of the day without deciding where each dish belongs.
- No servings field.
- No notes field.
- No takeout-specific field. Takeout is already modeled on `Dish`.
- No dish name snapshot in v1. Keep the model lean and rely on required `dish_id`.
- Deleting a dish with meal logs should be blocked.
- A separate History page is out of scope for v1.

## Data Model

Add a `meal_logs` table:

```sql
CREATE TABLE meal_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  dish_id INTEGER NOT NULL,
  slot TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE RESTRICT
);
```

Indexes:

```sql
CREATE INDEX idx_meal_logs_date ON meal_logs(date);
CREATE INDEX idx_meal_logs_dish_date ON meal_logs(dish_id, date);
CREATE UNIQUE INDEX idx_meal_logs_unique_slotted
  ON meal_logs(date, slot, dish_id)
  WHERE slot IS NOT NULL;
```

Duplicate rule:

- Prevent exact duplicates for `(date, slot, dish_id)` when `slot` is present.
- Allow multiple no-slot logs for the same dish/date.
- Also enforce duplicate prevention in the service layer so callers receive a friendly validation error instead of a raw SQLite constraint failure.

## Backend Service

Add `backend/src/services/mealLogs.ts`.

Service operations:

- `createMealLog({ date, dishId, slot? })`
- `listMealLogsByDate(date)`
- `deleteMealLog(id)`

Validation:

- `date` must be a `YYYY-MM-DD` date string.
- `dishId` must refer to an existing dish.
- `slot`, when present, must be one of `breakfast`, `lunch`, `dinner`, or `snack`.
- Duplicate slotted logs should return a domain-level conflict result or error.
- Deleting a missing meal log should return a not-found result.

Dish deletion:

- Update dish deletion behavior so dishes referenced by meal logs cannot be deleted.
- Return a clear error from REST and MCP when deletion is blocked by meal history.

## Shared API Contract

The app now uses shared endpoint contracts for REST and MCP. Meal logs should be added to `backend/src/endpoints/index.ts`, not implemented as separate REST route files plus separate MCP tool files.

### `log_meal`

Records that a registered dish happened on a date.

REST:

```http
POST /api/meal-logs
```

MCP:

```text
log_meal
```

Input:

```json
{
  "date": "2026-07-10",
  "dishId": 123,
  "slot": "dinner"
}
```

`slot` is optional.

Output:

```json
{
  "mealLog": {
    "id": 1,
    "date": "2026-07-10",
    "dishId": 123,
    "slot": "dinner",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

REST presentation may unwrap this to the meal log object if that matches existing endpoint style.

### `view_meal_logs`

Lists meal logs for one date.

REST:

```http
GET /api/meal-logs?date=2026-07-10
```

MCP:

```text
view_meal_logs
```

Input:

```json
{
  "date": "2026-07-10"
}
```

Output:

```json
{
  "mealLogs": [
    {
      "id": 1,
      "date": "2026-07-10",
      "dishId": 123,
      "slot": "dinner",
      "dish": {
        "id": 123,
        "name": "Coconut chicken curry"
      },
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

Include enough dish data for the UI to render the logged dish name without issuing a separate dish lookup.

### `remove_meal_log`

Deletes a meal log.

REST:

```http
DELETE /api/meal-logs/:id
```

MCP:

```text
remove_meal_log
```

Input:

```json
{
  "id": "1"
}
```

Output:

```json
{
  "success": true
}
```

## Frontend

Update shared frontend types:

- Add `MealLog`.
- Represent `slot` as `MealSlot | null`.

Update frontend API client:

- `mealLogs.list(date)`
- `mealLogs.create({ date, dishId, slot? })`
- `mealLogs.remove(id)`

Update `frontend/src/views/menuBuilder.ts`:

- Add a compact "Log dish" control for the selected date.
- Let the user choose a registered dish.
- Let the user optionally choose a slot.
- After save, clear the selected dish and slot inputs, keep the date unchanged, and reload the logs.
- Show a flat "Logged meals" list for the selected date.
- Each row should show the dish name, optional slot label, and a delete button.
- Planned menu entries may get a convenience log action if it stays simple, but this is not required for v1.

## Documentation

Create `API.md` in the repo root.

Document all first-class public operations, not only meal logs:

- auth/login
- dishes
- menus
- meal logs

For each operation, include:

- purpose
- REST method/path
- MCP tool name
- input shape
- output shape
- auth requirement

Call out that protected MCP tools require `auth.token`.

## Tests

Tests are non-negotiable.

Backend service tests:

- creates a meal log for an existing dish
- lists logs by date
- does not list logs from other dates
- deletes a meal log
- rejects invalid `dishId`
- rejects invalid slot
- prevents duplicate slotted logs
- allows duplicate no-slot logs for the same dish/date
- blocks deleting a dish with meal logs

Endpoint/REST tests:

- `POST /api/meal-logs` happy path
- `GET /api/meal-logs?date=...` happy path
- `DELETE /api/meal-logs/:id` happy path
- protected auth behavior
- validation error behavior
- duplicate slotted log conflict behavior

MCP tests:

- `log_meal`, `view_meal_logs`, and `remove_meal_log` are listed by `tools/list`
- auth is required for each protected meal-log tool
- `log_meal` creates a log
- `view_meal_logs` sees the created log
- `remove_meal_log` removes it
- validation and duplicate conflict errors are presented cleanly

E2E test:

- from Menu Builder, select a date
- log a registered dish
- reload or navigate away and back to that date
- verify the logged dish is still shown
- delete the log
- verify it disappears

## Out of Scope

- repetition avoidance
- suggestion ranking
- history page
- date range queries
- servings
- notes
- free-text or unregistered dish logs
- automatic logs from planned menus
- editing meal logs
