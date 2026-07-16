# Dish Recommendations Feature Plan

## Goal

Add a small backend-only recommendation module that returns dishes for one or more meal kinds while:

- filtering dishes by meal kind;
- excluding dishes recorded in recent meal logs;
- never returning the same dish twice in one response; and
- returning as many requested dishes as possible without weakening either exclusion rule.

This is intentionally not a learning or ranking system. Meal logs are the only feedback signal.

## Product Decisions

- Recommendations are generated for a required target date. Do not default to the server's current date; an explicit date keeps cooldown behavior predictable and supports planning future menus.
- A dish logged on date `L` is in cooldown for `L`, `L + 1 day`, and `L + 2 days`. It becomes eligible again on `L + 3 days`.
  - Equivalently, recommendations for target date `D` exclude a dish logged on `D`, `D - 1 day`, or `D - 2 days`.
  - Dates are calendar dates because meal logs store `YYYY-MM-DD`, not timestamps with a user timezone.
- Any meal log for a dish triggers cooldown, regardless of the log's slot. A dish logged for lunch is also unavailable as a dinner recommendation.
- `kind` reuses the existing meal-slot values: `breakfast`, `lunch`, `dinner`, and `snack`.
- A dish matches a kind when its `tags` array contains that exact value. `dessert` and `drink` remain valid dish tags but are not recommendation kinds in v1.
- One request may contain several kinds. A dish with multiple matching tags may satisfy only one requested position in a response.
- Candidate order is randomized so repeated calls are not permanently alphabetical. There is no score, preference model, weighting, or history-based ranking beyond cooldown.
- When too few eligible dishes exist, return a partial result. Never repeat a dish, ignore the kind, or bypass cooldown merely to reach the requested count.
- Recommendations are ephemeral. Do not save them as a menu or add any new table.
- The application is currently single-user, so the existing global `meal_logs` history is the user's history. Multi-user data ownership is out of scope.

## Public Interface

Add one shared protected operation to `backend/src/endpoints/index.ts`, following the existing REST/MCP endpoint registry pattern.

### `recommend_dishes`

REST:

```http
POST /api/recommendations
```

MCP:

```text
recommend_dishes
```

Input:

```json
{
  "date": "2026-07-20",
  "requests": [
    { "kind": "breakfast", "count": 2 },
    { "kind": "lunch", "count": 2 },
    { "kind": "dinner", "count": 1 }
  ]
}
```

Contract:

- `date` must be a real `YYYY-MM-DD` calendar date.
- `requests` must be non-empty.
- `kind` must be one of the four existing meal slots.
- `count` must be a positive integer.
- Each kind may appear at most once. Reject duplicates rather than inventing merge behavior.
- Keep the request reasonably bounded in validation (for example, no more than four groups and no count above 100) so malformed requests cannot create excessive allocation work.

Output:

```json
{
  "date": "2026-07-20",
  "recommendations": [
    {
      "kind": "breakfast",
      "requested": 2,
      "dishes": [
        {
          "id": 12,
          "name": "Oatmeal with berries",
          "tags": ["breakfast"],
          "takeout": false,
          "ingredients": [],
          "instructions": "",
          "notes": "",
          "created_at": "...",
          "updated_at": "..."
        }
      ]
    }
  ]
}
```

- Return recommendation groups in the same order as the input requests.
- Reuse the existing parsed dish shape rather than creating a reduced second dish representation.
- `requested` makes partial results self-describing. A group is short when `dishes.length < requested`.
- A successful partial result is still HTTP 200 / a successful MCP result; scarcity is not a request error.

This grouped interface is preferable to a generic `filters` object in v1. Kind is the only filter, and naming it directly keeps both callers and validation small.

## Recommendation Module

Add `backend/src/services/recommendations.ts` with one external interface:

```ts
recommendDishes({ date, requests }): RecommendationResult
```

The module should own candidate loading, cooldown exclusion, kind matching, randomized selection, cross-group deduplication, and partial-result behavior. Callers and tests should use this interface rather than coordinating dish and meal-log modules themselves.

Do not add repository interfaces or adapters. The implementation uses the same local SQLite dependency as the existing dish and meal-log modules, and no behavior varies across adapters.

### Candidate Query

Use one SQLite query to load parsed dishes that have no meal log in the cooldown window:

```sql
SELECT dishes.*
FROM dishes
WHERE NOT EXISTS (
  SELECT 1
  FROM meal_logs
  WHERE meal_logs.dish_id = dishes.id
    AND meal_logs.date BETWEEN date(?, '-2 days') AND ?
)
ORDER BY RANDOM()
```

Pass the target date for both placeholders. The existing `idx_meal_logs_dish_date` index supports this lookup, so no schema or index change is needed.

Parse rows with the existing dish parser, then match request kinds against `dish.tags` in memory. For the expected personal dish-library size, this keeps the query and implementation simpler than dynamically composing JSON/tag SQL for each request.

### Allocation

A simple "fill breakfast, then lunch" loop can produce an avoidable shortfall when dishes have multiple tags. For example, if one dish matches breakfast and lunch and another matches only breakfast, consuming the multi-kind dish for breakfast leaves lunch empty even though both requests could be filled.

Use a small maximum bipartite matching helper inside the module:

1. Expand each `{ kind, count }` into the requested positions.
2. Connect each position to eligible dishes tagged for that kind.
3. Assign at most one dish to each position and at most one position to each dish, allowing an existing assignment to move when that fills an additional position.
4. Group assigned dishes back into the original request order.

Candidate rows arrive in random order, so the matching still produces varied recommendations. This helper should remain an implementation detail, not another public module interface. The behavior guarantee is maximum fill subject to kind, cooldown, and no-duplicate constraints; the exact dish order is not guaranteed.

## Validation and Errors

- Reuse the existing valid-date behavior from `mealLogs.ts`; move the date helper to a small shared location only if importing it from meal logs would create an awkward dependency. Do not duplicate date parsing.
- Reuse `MEAL_SLOTS` for the recommendation-kind schema.
- Let Zod present malformed requests as the existing `400 Invalid request` response.
- Do not introduce recommendation-specific domain errors unless implementation uncovers a real failure mode.
- The endpoint remains protected in REST and MCP, consistent with every operation that reads user data.

## Files to Change

- Add `backend/src/services/recommendations.ts` for the recommendation module.
- Add `backend/src/services/__tests__/recommendations.test.ts` for behavior tests at that module's interface.
- Update `backend/src/endpoints/index.ts` with input/output schemas and the `recommend_dishes` endpoint definition.
- Update `backend/src/endpoints/__tests__/registry.test.ts` to include the new shared endpoint.
- Add focused REST coverage in `backend/src/rest/__tests__/http.test.ts`.
- Add an MCP test such as `backend/src/mcp/__tests__/recommend-dishes.test.ts`.
- Update `API.md` and the MCP tool table in `README.md`.

Do not change `db.ts`, frontend types, frontend API code, or frontend views.

## Tests

### Recommendation Module

- returns only dishes tagged with the requested kind;
- supports several request groups and preserves their order;
- never returns the same dish twice across groups;
- excludes a dish logged on the target date;
- excludes a dish logged one day before the target date;
- excludes a dish logged two days before the target date;
- allows a dish logged three days before the target date;
- ignores logs after the target date;
- applies cooldown regardless of the logged meal slot or a null slot;
- fills overlapping multi-tag requests maximally when a valid unique assignment exists;
- returns a partial group when there are not enough eligible dishes;
- returns empty dish arrays when no candidates are eligible;
- does not create menu or meal-log records.

Because selection is randomized, assert eligibility, uniqueness, counts, and set membership rather than a fixed dish order.

### Shared Endpoint / REST

- accepts the example multi-kind request and returns the documented grouped shape;
- rejects invalid dates, kinds, counts, empty requests, and duplicate kinds;
- requires authentication;
- returns HTTP 200 for a valid partial result;
- exposes `recommend_dishes` through the endpoint registry.

### MCP

- lists `recommend_dishes` in `tools/list`;
- requires `auth.token`;
- returns eligible, unique dishes for a multi-kind request;
- presents validation errors consistently with existing tools.

No browser E2E test is needed because UI work is explicitly out of scope.

## Implementation Order

1. Add failing module tests for kind filtering, cooldown boundaries, uniqueness, overlap allocation, and scarcity.
2. Implement the single recommendation module and make its tests pass.
3. Add the shared endpoint schemas and handler, then update registry and REST tests.
4. Add MCP coverage through the generated tool interface.
5. Update `API.md` and `README.md` and run the full backend build and test suite.

## Out of Scope

- UI or frontend client changes;
- automatically saving recommendations into `menus`;
- using planned menu entries as history or exclusions;
- preferences, ratings, likes/dislikes, dismissals, clicks, or acceptance tracking;
- ranking by frequency, recency beyond the hard cooldown, ingredients, takeout, nutrition, cost, season, or preparation time;
- configurable cooldown duration;
- per-kind cooldowns;
- pagination, recommendation sessions, caching, or stored recommendation history;
- guaranteeing stable results between calls;
- multi-user schema changes.

## Acceptance Criteria

- A caller can request `2 breakfast`, `2 lunch`, and `1 dinner` recommendation for a target date in one protected REST or MCP call.
- Every returned dish matches its group's kind.
- No dish ID occurs more than once anywhere in the response.
- A dish logged on either of the two preceding calendar days, or on the target date, is absent.
- A dish logged three days before the target date may be returned.
- The response is maximally filled from eligible unique dishes and clearly represents any shortfall.
- The feature adds no database schema, persistence, UI, or generalized recommendation framework.
