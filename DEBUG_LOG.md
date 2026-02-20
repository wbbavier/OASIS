# OASIS Debug Log

Running record of bugs, root causes, and fixes encountered during development.
Claude Code maintains this file and consults it before starting any debug session.

---

## [2026-02-19] Supabase join: `column profiles_1.email does not exist`

**Symptom:** Loading the lobby page threw `column profiles_1.email does not exist`.

**Root cause:** `public.profiles` only stores `id`, `username`, `avatar_url`, `created_at`, `updated_at`. The `email` field lives in `auth.users`, which is not directly joinable via the Supabase JS client. The query `.select('player_id, civilization_id, profiles(email)')` asked PostgREST to select a column that doesn't exist on the joined table.

**Fix:** Changed the select to `profiles(username)` and propagated the rename (`email` → `username`) through `PlayerRow`, `GamePlayer`, `PlayerEntry` interfaces and their render sites in `PlayerList.tsx`.

**Files changed:** `src/app/game/[id]/page.tsx`, `src/components/lobby/LobbyRoom.tsx`, `src/components/lobby/PlayerList.tsx`

**Rule going forward:** Never query `email` via a `profiles(...)` join — it isn't on that table. Use `username` from `profiles`, or `user.email` from the Supabase auth session object (available client-side via `useAuth()`).

---

## [2026-02-19] Auth callback: "No code found in URL"

**Symptom:** After clicking the magic link, `/auth/callback` showed "No code found in URL. The link may have expired."

**Root cause:** Two compounding issues:
1. The Supabase client was using **implicit flow** (token in `#hash`) but the callback page only handled **PKCE flow** (`?code=` query param).
2. The `emailRedirectTo` URL (`/auth/callback`) was not in the Supabase dashboard's allowed redirect list, so Supabase fell back to the site root.

**Fix:**
- Added `auth: { flowType: 'pkce' }` to `createClient` in `src/lib/supabase.ts` so future links use `?code=`.
- Updated `/auth/callback` to handle **both flows**: if `?code=` is present use `exchangeCodeForSession`; otherwise listen for `onAuthStateChange` (Supabase auto-processes hash tokens on init) with a 5 s fallback timeout.
- Added `/auth/callback` to allowed redirect URLs in Supabase dashboard.

**Files changed:** `src/lib/supabase.ts`, `src/app/auth/callback/page.tsx`

---

## [2026-02-19] Migration 001 fails: `relation "public.game_players" does not exist`

**Symptom:** Running `001_initial_schema.sql` in the Supabase SQL editor threw `ERROR 42P01: relation "public.game_players" does not exist`.

**Root cause:** The `games` table's RLS policies (`games_select_members`, `games_update_members`) contain `EXISTS (SELECT 1 FROM public.game_players …)` subqueries. PostgreSQL validates referenced relations **at policy-creation time**, but `game_players` was defined later in the same file.

**Fix:** Reordered `001_initial_schema.sql`:
1. `profiles` table + policies
2. `games` table + **insert policy only**
3. `game_players` table + policies  ← must exist before step 4
4. `games` SELECT / UPDATE policies (now safe to reference `game_players`)
5. Remaining tables (`turn_orders`, `turn_history`, `invites`) + their policies

**Files changed:** `supabase/migrations/001_initial_schema.sql`

**Rule going forward:** Never write an RLS policy that references a table defined later in the same migration.

---

## [2026-02-19] Infinite recursion in `game_players` RLS policy

**Symptom:** Loading the game page returned `infinite recursion detected in policy for relation "game_players"`.

**Root cause:** The `game_players_select_members` policy used a self-referencing subquery:
```sql
USING (
  EXISTS (
    SELECT 1 FROM public.game_players gp2   -- ← same table!
    WHERE gp2.game_id = game_players.game_id
      AND gp2.player_id = auth.uid()
  )
);
```
PostgreSQL enforces the policy on every row access, including the inner `SELECT`, causing infinite recursion.

**Fix:** Dropped `game_players_select_members`. Migration 002 already adds `game_players_select_authenticated` (`USING (true)` for any authenticated user) which covers all legitimate read access without recursion.

**Immediate remediation (SQL editor):**
```sql
DROP POLICY IF EXISTS "game_players_select_members" ON public.game_players;
```

**Files changed:** `supabase/migrations/001_initial_schema.sql`

**Rule going forward:** Never write a SELECT policy on table T that queries table T in its USING clause. Use a `SECURITY DEFINER` function or restructure the policy.

---

## [2026-02-19] Create game fails: foreign key violation on `games.created_by`

**Symptom:** Clicking "Create game" returned `insert or update on table "games" violates foreign key constraint "games_created_by_fkey"`.

**Root cause:** `games.created_by` is a FK → `profiles.id`. The user's account was created **before** the migrations ran, so the `handle_new_user` trigger never fired and no `profiles` row exists for them.

**Fix:** Run the backfill query once after migrations are applied:
```sql
INSERT INTO public.profiles (id, username)
SELECT id, split_part(email, '@', 1)
FROM auth.users
ON CONFLICT (id) DO NOTHING;
```
This is now included at the bottom of the combined setup script.

**Rule going forward:** Whenever migrations are applied to an existing Supabase project (i.e. users already exist in `auth.users`), always run the backfill. Include it in all "first-time setup" instructions.

---

## [2026-02-19] Resolve turn used empty orders instead of stored orders from DB

**Symptom:** Turns resolved successfully but research, construction, and diplomacy orders had no effect — engine processed empty `PlayerOrders` for every player.

**Root cause:** `handleResolve` in `TurnPanel` built `PlayerOrders` by mapping the `submitted` rows (which only contain `player_id` and `civilization_id`) and hard-coded `orders: []`. Actual orders written by `handleSubmit` into `turn_orders.orders` (the full `PlayerOrders` JSONB blob) were never loaded.

**Fix:** In `handleResolve`, replaced the empty-orders map with a Supabase query that fetches all `turn_orders` rows for the current game/turn, selecting `orders`, then casts each row as `PlayerOrders` and passes the full array to `resolveTurn`.

**Files changed:** `src/components/game/TurnPanel.tsx`

**Rule going forward:** Never rebuild `PlayerOrders` from submission metadata rows alone. Always load the full `orders` JSONB column from `turn_orders` when resolving a turn.

---

## [2026-02-20] Map renders all-dark: terrain, settlements, and units invisible

**Symptom:** The hex map rendered as a grid of identical dark gray hexes. No terrain differentiation (plains, mountains, forest, etc.), no settlement markers, no unit dots, and no fog of war distinction. Only a few hexes near the player's capital had colored civ outlines. The map was functionally unreadable.

**Root cause:** `HexMap.tsx` had no `fogOfWar` prop. The visibility check was hardcoded as `currentCivId === null || hex.exploredBy.includes(currentCivId)`. Since the game initializer only marks the capital hex and its 6 neighbors as `exploredBy`, ~95% of hexes evaluated `visible = false`, rendering with fill `#1C1C1C` (dark gray). Terrain colors, settlement markers, and unit dots are all gated behind `visible`, so they were hidden too. Meanwhile, `GameView.tsx` had access to `gameState.config.fogOfWar` (which is `false` for new games) but never passed it to `HexMap`.

**Fix:**
1. Added `fogOfWar` prop to `HexMap` interface (default `false`)
2. Changed visibility check to `!fogOfWar || currentCivId === null || hex.exploredBy.includes(currentCivId)`
3. Passed `fogOfWar={gameState.config.fogOfWar}` from `GameView` to `HexMap`
4. Removed debug text markers from `GameView.tsx`

**Files changed:** `src/components/map/HexMap.tsx`, `src/components/game/GameView.tsx`

**Rule going forward:** Any rendering gate based on player knowledge (fog of war, visibility) must respect the `config.fogOfWar` flag. When fog is disabled, all hexes must be fully visible. Never hardcode visibility to depend solely on `exploredBy` without checking the fog of war config.

---

## [2026-02-20] Units can only move once ever — movesRemaining never reset

**Symptom:** After turn 1, units showed `movesRemaining: 0` and could not be selected for movement. Only newly spawned units could move. Both human and AI units were affected.

**Root cause:** When a unit moves, `resolveMovement()` sets `movesRemaining: 0` on the moved unit. However, nothing in the turn resolution pipeline ever reset `movesRemaining` back to the unit definition's `moves` value at the start of a new turn. Once spent, moves were gone forever.

**Fix:** Added a map-wide reset at the top of `resolveTurn()` (before any orders are processed) that iterates all units and sets `movesRemaining` to the value from `theme.units` matching `unit.definitionId`.

**Files changed:** `src/engine/turn-resolver.ts`

**Rule going forward:** Any per-turn resource on a unit or entity (moves, actions, etc.) must be explicitly reset at the start of each turn in `resolveTurn()`. Never assume a value carries over correctly — add the reset step and look up the canonical value from the theme definition.

---

## [2026-02-20] Movement validation accepts illegal diagonal moves on hex grid

**Symptom:** Units could move to hexes that are not true hex neighbors — specifically the two "diagonal" positions that Chebyshev distance considers adjacent but the odd-r offset hex grid does not.

**Root cause:** `resolveMovement` in `turn-resolver.ts` validated each movement step using Chebyshev distance (`Math.abs(dCol) <= 1 && Math.abs(dRow) <= 1`), which allows 8 directions. However, the hex grid uses odd-r offset coordinates with only 6 neighbors per hex. Two of the 8 Chebyshev-adjacent cells are not valid hex neighbors.

**Fix:** Replaced the Chebyshev distance check with a call to `getNeighbors(prev, cols, rows)` from `map-generator.ts`, which correctly computes the 6 hex neighbors using odd-r offset rules. Each step in the path is now validated against the actual neighbor list.

**Files changed:** `src/engine/turn-resolver.ts`

**Rule going forward:** Never use Chebyshev or Manhattan distance for hex adjacency checks. Always use `getNeighbors()` from `map-generator.ts` which encodes the correct odd-r offset neighbor offsets.

---

## Template for new entries

```
## [YYYY-MM-DD] Short description

**Symptom:** What the user saw / what error message appeared.

**Root cause:** Why it happened.

**Fix:** What was changed, including any SQL to run immediately.

**Files changed:** list of files

**Rule going forward:** What to avoid / check in future.
```
