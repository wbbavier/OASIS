# OASIS — Progress Summary
*For the Claude Opus agent continuing this project.*

---

## What This Project Is

A weekly turn-based civilization simulation game, playable in a browser by a small group of invited friends. Each game is themed to a specific fictional or historical universe — the first theme being **The Lions of Al Rassan** by Guy Gavriel Kay.

Players log in once or twice a week, review what happened, submit their orders (move units, allocate resources, conduct diplomacy, respond to events), and wait for the next turn to resolve. The game is designed around that slow, deliberate pace — it's closer to a board game played by mail than a real-time strategy game.

**The core constraint driving every technical decision:** the entire project must run on free infrastructure with zero ongoing costs. No runtime AI calls. No paid APIs. No servers to maintain beyond what Vercel and Supabase provide for free.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React 19 + TypeScript (strict mode) |
| Styling | Tailwind CSS only — no CSS files |
| Database & Auth | Supabase (free tier Postgres + Auth) |
| Hosting | Vercel (free tier, auto-deploys from `main`) |
| Testing | Vitest 3 |
| Game logic | Pure TypeScript functions, runs client-side in the browser |

The project lives at: `https://github.com/wbbavier/OASIS`

Environment variables (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are set in the Vercel dashboard. They are NOT in the repo. A `.env.local.example` file documents what's needed.

---

## What Has Been Built

### Phase 0 — Scaffold (complete)

- Next.js project scaffolded with TypeScript, Tailwind, Supabase client
- Deployed to Vercel from the `main` branch
- Supabase project connected
- GitHub Actions keep-alive cron (`/.github/workflows/keep-alive.yml`) pings Supabase every 5 days to prevent free-tier project pausing
- `CLAUDE.md` (project instructions) committed to the repo root
- `PROJECT_ARCHITECTURE.md` (full design document) committed to the repo root

### Phase 1 — Foundation Engine (complete, committed `ea82590`)

All game engine TypeScript and the database schema are now in place.

#### `src/engine/types.ts`
Defines every type the engine uses. Key types:
- `PRNG` — interface for the seeded random number generator
- `TerrainType` — union of 7 terrain values (`plains`, `mountains`, `forest`, `desert`, `coast`, `sea`, `river`)
- `HexCoord`, `Hex`, `Settlement`, `Unit`, `ResourceDeposit` — map primitives
- `CivilizationState` — runtime state of a single civilization (resources, tech, diplomatic relations, tension axes, stability, etc.)
- `GameState` — the entire serialized game (map grid, all civilizations, active events, turn history, RNG seed/state, config)
- `PlayerOrders` — a player's submitted orders for one turn; contains a discriminated union `AnyOrder` covering move, construction, research, diplomacy, event response, and resource allocation
- `TurnSummary`, `TurnSummaryEntry`, `CombatResultSummary` — what gets recorded in the turn history
- `ResolutionPhase`, `ResolutionLog` — pipeline metadata
- `GamePhase`, `GameConfig` — game-level settings

#### `src/themes/schema.ts`
Defines the `ThemePackage` interface — the shape of a `theme.json` file. Key parts:
- `MapConfig` — anchor-constrained map generation config. Themes specify named city positions (`SettlementAnchor`, with `approxCol`/`approxRow`) and regional terrain zones (`MapZone`, with `terrainWeights`). The engine places anchors exactly and fills terrain procedurally within zone constraints. This is how a theme preserves geographic identity (e.g., Al Rassan's north/south divide) while still varying each game.
- `CivilizationDefinition` — static theme data for each playable civ (starting resources, unique units/buildings, flavor text)
- `BuildingDefinition`, `UnitDefinition` — referenced by id throughout
- `TechDefinition` with `TechEffect` discriminated union
- `EventDefinition` with `EventTrigger` and `EventEffect` discriminated unions
- `VictoryCondition` and `DefeatCondition` discriminated unions
- `MechanicModifiers` — tension axes, combat modifiers, resource interactions, turn cycle (seasons)
- `ThemeFlavor` — turn names, currency names, era names, setting description

#### `src/engine/prng.ts`
Mulberry32 seeded PRNG. All randomness in the game engine must go through this — never `Math.random()`.
- `hashSeed(seed: string): number` — FNV-1a hash converts a string seed to a uint32
- `createPRNG(seed: number): PRNG` — main factory
- `createPRNGFromSeed(seed: string): PRNG` — convenience wrapper
- `createPRNGFromState(state: number): PRNG` — restore PRNG from serialized state (stored in `GameState.rngState`)
- `PRNG.fork()` — returns a new PRNG from current state, so callers can advance independently without disturbing the main sequence
- `weightedChoice<T>(items, prng): T` — weighted random selection used by map generator and event system

The `fork()` pattern is used throughout `turn-resolver.ts` so that combat, events, and AI each get their own PRNG fork. This keeps turn resolution deterministic regardless of the order modules consume randomness.

#### `src/engine/map-generator.ts`
Generates a 2D hex grid (`Hex[][]`) from a `MapConfig`.

Algorithm:
1. Build a zone lookup map (`"col,row" → MapZone`) from zone shape definitions
2. Place anchors: snap `approxCol/approxRow` to grid integers; if that hex is already taken, BFS outward to find the nearest free hex
3. Fill terrain: for each hex, merge `defaultTerrainWeights` with zone overrides, exclude `sea` and `mountains` for anchor hexes (settlements can't go there), then call `weightedChoice`
4. Apply sea border: if `seaEdge: true`, force all edge hexes to `sea`
5. Apply zone initial control to non-anchor hexes

Exports: `generateMap`, `initializeMap` (alias), `getNeighbors` (odd-r offset hex convention).

#### `src/engine/turn-resolver.ts`
The 11-phase turn resolution pipeline. Call signature:
```typescript
resolveTurn(state: GameState, submittedOrders: PlayerOrders[], theme: ThemePackage, prng: PRNG): TurnResolutionResult
```

Phase order (matches `CLAUDE.md` exactly):
1. Fill missing orders with AI governor
2. Diplomacy
3. Validate orders
4. Movement
5. Combat (uses `prng.fork()`)
6. Economy
7. Construction
8. Research
9. Events (uses `prng.fork()`)
10. Attrition & stability
11. Victory/defeat check
12. Generate summary

Returns `{ state: GameState, logs: ResolutionLog[] }`. The returned state has `turn` incremented by 1, `rngState` updated, and a new `TurnSummary` appended to `turnHistory`.

**Known impurity (Phase 3 TODO):** `new Date().toISOString()` is called inside the resolver for `lastResolvedAt`. This makes the function technically impure. Phase 3 should accept `resolvedAt: string` as a parameter.

#### Stub modules (Phase 1 no-ops, full logic in Phase 2/3)
- `src/engine/combat.ts` — `resolveCombat(state, theme, prng): GameState`
- `src/engine/economy.ts` — `resolveEconomy(state, theme): GameState`
- `src/engine/events.ts` — `resolveEvents(state, theme, prng): GameState`
- `src/engine/diplomacy.ts` — `resolveDiplomacy(state, orders, theme): GameState`
- `src/engine/ai-governor.ts` — `generateAIOrders(state, civId, theme, prng): PlayerOrders` and `fillMissingOrdersWithAI(state, submitted, theme, prng): PlayerOrders[]`

All stubs return the input state unchanged. `fillMissingOrdersWithAI` correctly identifies civs without submitted orders and fills them in with empty order sets.

#### `src/lib/theme-loader.ts`
`loadTheme(raw: unknown): ThemePackage` — validates that required fields are present, then type-asserts. Phase 3 should replace this with a Zod schema parse.

#### Tests (`src/engine/__tests__/`)
49 tests, all passing.
- `prng.test.ts` — 17 tests: determinism, range checks, fork behavior, string hashing, `weightedChoice`
- `map-generator.test.ts` — 17 tests: dimensions, terrain validity, sea edge, anchor placement, anchor terrain exclusions, zone control, determinism
- `turn-resolver.test.ts` — 15 tests: turn increment, state preservation, `lastResolvedAt`, phase logs, turn history, determinism, AI fill-in

Run with: `npm test`

#### `supabase/migrations/001_initial_schema.sql`
Six tables with full Row Level Security and performance indexes:

| Table | Purpose |
|-------|---------|
| `profiles` | Extends `auth.users`. Auto-created on sign-up via trigger. |
| `games` | One row per game. `game_state` is the full serialized `GameState` JSONB. |
| `game_players` | Join table: player ↔ game ↔ civilization assignment. |
| `turn_orders` | Submitted `PlayerOrders` per player per turn. |
| `turn_history` | Resolved `TurnSummary` per turn. |
| `invites` | Invite codes for joining a game. Select policy allows unauthenticated reads (needed for join links). |

**This migration has NOT been run yet.** It needs to be executed in the Supabase dashboard → SQL Editor before any database-connected work can proceed.

#### `vitest.config.ts`
Vitest configured with `environment: 'node'`, `globals: false`, includes `src/**/__tests__/**/*.test.ts`, and the `@/` path alias matching `tsconfig.json`.

---

## What Does NOT Exist Yet

Nothing beyond the engine types and stubs. Specifically:

- **No game UI** — no map renderer, no civilization dashboard, no turn orders panel
- **No real game logic** — combat, economy, events, diplomacy, research, construction are all stubs
- **No Al Rassan theme package** — `src/themes/al-rassan/` doesn't exist yet
- **No auth flow** — Supabase Auth is configured but no sign-in/sign-up UI
- **No game creation flow** — no lobby, no invite system UI
- **The DB migration has not been run** — tables don't exist yet in Supabase

---

## Development Phases Remaining

### Phase 2 — Al Rassan Theme Package
Generate `src/themes/al-rassan/theme.json`. This is the first real theme and validates the schema.

Contents to create:
- 4–6 civilizations (Jaddites, Asharites, Kindath, sub-factions) with starting resources, unique units/buildings, and flavor text
- Map config with settlement anchors matching the Iberian-analog geography (north/south religious divide, coastal cities, inland fortresses)
- Resources appropriate to the setting (grain, trade goods, soldiers, piety/faith)
- Tech/culture tree (30–40 nodes)
- Event deck (30–50 events with triggers and narrative consequences)
- The religious tension axis mechanic (a per-civilization `tensionAxes` value that drives events and affects diplomacy)
- Victory conditions (military conquest, cultural dominance, political survival)
- Defeat conditions (capital lost, stability collapse, religious persecution)
- Flavor (seasons named, currency named "Dinars", era names, setting description)

### Phase 3 — Single-Player Playable (Core Game Logic)
Implement the stub modules with real logic:
- **Combat:** seeded dice rolls, unit strength/morale, terrain modifiers, garrison bonuses
- **Economy:** resource yields by terrain and building, upkeep costs, trade
- **Events:** trigger evaluation, weighted selection, effect application, player choice handling
- **Diplomacy:** treaty processing, war declaration consequences, relationship state transitions
- **Research:** tech point accumulation, completion, effect application
- **Construction:** build queue progress, completion, building effect application
- **Attrition:** morale decay, stability calculation, revolt triggers

Also: fix the `new Date().toISOString()` impurity in `turn-resolver.ts` by accepting `resolvedAt` as a parameter.

Also: add Zod validation to `theme-loader.ts`.

### Phase 3 continued — UI
Build the browser interface:
- Map view (hex grid renderer, terrain visualization, unit display, fog of war)
- Civilization dashboard (resources, stability, tech progress)
- Turn orders panel (order submission, movement path selection)
- Event cards (narrative display, choice buttons)
- Turn summary / history view
- Wire everything to Supabase (game state reads, order writes)

### Phase 4 — Multiplayer
- Supabase Auth UI (sign up, sign in, magic link)
- Game lobby and invite link flow
- Multi-player turn submission and deadline management
- Diplomatic messaging between players
- Concurrent-resolution safety (prevent double-resolution race condition using Supabase row locking)

### Phase 5 — Theme Abstraction
- Generate a second theme from a different universe to validate the schema generalizes
- Create the blank `_template/theme.json` with all fields populated with examples
- Document theme creation process

---

## Conventions to Follow

All of these are enforced in `CLAUDE.md` — read that file first. Key rules:

- **No `Math.random()`** — always use the seeded PRNG passed as a parameter
- **No AI/LLM API calls** at runtime — ever
- **No `any` types** — use `unknown` and narrow, or define proper interfaces
- **All engine functions must be pure** — no database calls, no async, no side effects
- **No CSS files** — Tailwind utility classes only
- **No ORM** — use the Supabase JS client directly
- **No WebSockets** — weekly turn-based, no real-time sync needed
- **Components max 150 lines** — split if larger
- **Functional components only** — no class components

---

## Running the Project Locally

```bash
# Clone and install
npm install

# Set up local env (copy the example and fill in Supabase credentials)
cp .env.local.example .env.local

# Run dev server
npm run dev

# Run tests
npm test

# Type check
npm run typecheck

# Build for production
npm run build
```

The `.env.local` file needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project dashboard.
