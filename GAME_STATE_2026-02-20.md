# OASIS Game State — 2026-02-20

Snapshot of what's implemented, what's incomplete, and what's known broken. Validated by skeptic agent review (see bottom).

---

## Engine Modules (10 files, 3,479 lines total)

| File | Lines | Status | Key Capabilities |
|------|-------|--------|-----------------|
| `types.ts` | 259 | Implemented | All game type definitions: `GameState`, `PlayerOrders`, `AnyOrder` (discriminated union of 7 order types), `Hex`, `Unit`, `Settlement`, `CivilizationState`, `TurnSummary`, `GameConfig`, `ActiveEvent` |
| `combat.ts` | 504 | Implemented | Combat encounters, effective power calculation (tech + season + terrain + civ abilities), casualty application (60% loser / 30% winner), morale damage, retreat via BFS toward capital, siege bonuses for settlements |
| `economy.ts` | 339 | Implemented | Terrain yields, building effects, unit upkeep, resource interactions (4 cross-resource multipliers), tech resource multipliers, seasonal modifiers, grain consumption (`floor(pop/100)`) |
| `events.ts` | 325 | Implemented | Trigger evaluation (turn_number, turn_range, resource_low, at_war, stability_below, tension_above, tech_completed, always), choice effect application, event activation/deactivation |
| `diplomacy.ts` | 162 | Implemented | Symmetric relation management, mutual proposal matching (peace/alliance/truce), war declarations with faith cost and stability penalty, vassalage, message passing |
| `turn-resolver.ts` | 933 | Implemented | Full turn pipeline (18 steps), order validation, movement with hex neighbor checks, construction, recruitment (1 per settlement per turn), research (20 pts/turn), attrition, victory/defeat checks, summary generation |
| `ai-governor.ts` | 527 | Implemented | 4 AI personality types (militarist, diplomat, trader, pacifist) derived from civ abilities. Generates move, recruit, research, build, and diplomacy orders. BFS pathfinding toward targets. |
| `map-generator.ts` | 265 | Implemented | Procedural hex map (odd-r offset), zone-based terrain weights, settlement anchor placement, sea border enforcement, `getNeighbors` for hex adjacency |
| `prng.ts` | 104 | Implemented | Seeded mulberry32 PRNG, `fork()` for independent streams, `weightedChoice`, string seed hashing, state save/restore |
| `pathfinding.ts` | 61 | Implemented | `getReachableCoords` — BFS flood-fill for unit movement range, respects terrain passability (blocks sea/mountains for non-naval) |

---

## Turn Resolution Pipeline

Actual execution order in `resolveTurn()` (18 steps):

| # | Phase | CLAUDE.md Spec | Notes |
|---|-------|----------------|-------|
| 1 | Reset unit moves | -- | Pre-phase: restores `movesRemaining` from theme definitions |
| 2 | Snapshot resources | -- | Pre-phase: captures pre-turn state for delta calculation |
| 3 | AI fill | -- | `fillMissingOrdersWithAI` for unsubmitted/NPC civs |
| 4 | Diplomacy | 1. Diplomacy | Matches spec |
| 5 | Validate orders | 2. Orders | Pass-through currently (structural validation only) |
| 6 | Movement | 3. Movement | Matches spec |
| 7 | Combat | 4. Combat | Matches spec |
| 8 | Control transfer | -- | **Addition:** sole occupant claims hex ownership |
| 9 | Economy | 5. Economy | Matches spec |
| 10 | Healing | -- | **Addition:** units at friendly settlements +1 strength |
| 11 | Construction | 6. Construction | Matches spec |
| 12 | Recruitment | -- | **Addition:** separate from Construction in spec |
| 13 | Research | 7. Research | Matches spec |
| 14 | Events | 8. Events | Matches spec |
| 15 | Attrition | 9. Attrition | Matches spec |
| 16 | Victory/Defeat | 10. Victory/Defeat | Matches spec |
| 17 | Summary | 11. Summary | Matches spec |
| 18 | Advance turn | -- | Post-phase: increment counter, persist RNG state |

**Deviations from CLAUDE.md:** Three phases added (Control Transfer, Healing, Recruitment as separate from Construction). No phases removed or reordered from the spec.

---

## Theme: The Lions of Al Rassan

### Civilizations (5)

| Civ | Color | Starting Dinars | Soldiers | Faith | Settlements | Starting Techs |
|-----|-------|----------------|----------|-------|-------------|----------------|
| Kingdom of Ragosa | Gold (#C9A84C) | 60 | 20 | 20 | 2 (capital + city) | trade-networks, patronage-arts |
| Emirate of Cartada | Dark Red (#8B1A1A) | 30 | 50 | 15 | 2 | levy-infantry, horsemanship |
| Kingdom of Valledo | Blue (#1A3A6B) | 30 | 35 | 40 | 2 | levy-infantry, horsemanship, patronage-arts |
| Kingdom of Ruenda | Purple (#5B2E8C) | 40 | 30 | 20 | 2 | trade-networks, horsemanship |
| The Kindath | Silver (#B0B0B8) | 70 | 5 | 20 | 1 (capital only) | trade-networks |

Plus 3 neutral settlements (Qurtaba, Iron Pass, Cape Varena).

### Content Counts

| Category | Count | Details |
|----------|-------|---------|
| Techs | 30 | Era 1: 10, Era 2: 12, Era 3: 8 |
| Buildings | 14 | Granary through Siege Workshop |
| Units | 10 | Levy Spearman through Court Guard |
| Events | 33 | Resource (4), stability (2), war (5), turn-range (12), fixed-turn (6), tension (8), tech (2), always (1) |
| Victory conditions | 4 | Eliminate all, control 40 hexes, 500 faith, 300 trade goods |
| Defeat conditions | 3 | Capital lost, stability zero, eliminated by combat |
| Resources | 6 | Dinars, grain, soldiers, faith, trade goods, horses |
| Resource interactions | 4 | Grain->soldiers, horses->soldiers, trade_goods->dinars, faith->soldiers |
| Seasons | 4 | Spring, summer, autumn, winter (4-turn cycle) |

### Special Mechanics

- **Religious Fervor** (0-100): Global tension axis. Triggers persecution events at 60+, holy war at 70+.
- **Muwardi Threat** (0-100): Doom clock. Vanguard at 50, army at 70, last battle at 90. Enemy units spawn.
- **Terrain combat modifiers**: Mountains 0.8 (best defense), desert 0.85, forest/river 0.9, coast 0.95, plains 1.0.
- **Map**: 22x16 hex grid, odd-r offset, sea borders, 6 terrain zones.

---

## What Works (Implemented & Functional)

- Full game creation flow: auth (magic link) -> create game -> pick civ -> invite link -> join -> lobby -> start
- Hex map rendering with terrain colors, settlement markers, unit dots, ownership borders, selection/movement overlay
- Fog of war toggle (respects `config.fogOfWar`)
- Turn submission: research, build, recruit, move, diplomacy, event response orders
- Turn resolution: all 18 phases execute in sequence with seeded PRNG
- Combat system: power calculation with tech/terrain/season/ability modifiers, casualties, retreat BFS, siege bonuses
- Economy: terrain yields, building production, unit upkeep, seasonal effects, resource interactions, tech multipliers
- Diplomacy: war declarations, mutual peace/alliance/truce proposals, vassalage, stability penalties
- AI governor: 4 personality types, generates all order types, fills missing player orders
- Events: 33 events with conditional triggers, player choices, effect application
- Research: 20 pts/turn, tech prerequisites, unlock effects (units, buildings, resource modifiers, combat modifiers)
- Construction: building prerequisites (tech), cost deduction, per-settlement building limits
- Recruitment: tech-gated unit availability, cost check, 1 per settlement per turn
- Victory/defeat checking: all 4 victory and 3 defeat conditions evaluated each turn
- Turn summary: per-civ narrative, resource deltas, combat results, event notifications, world news
- CivDashboard: resources with deltas, stability bar, diplomatic relations
- OrdersPanel: 5 tabbed sub-panels (Research, Build, Recruit, Diplomacy, Events) with notification badges
- Unit movement: click-to-select, BFS reachable overlay, click-to-move with hex neighbor validation
- Supabase integration: RLS on all 6 tables, PKCE auth, game state persistence

---

## What's Incomplete

### 13 Custom Tech Effects (defined in theme, ignored by engine)

All effects with `"kind": "custom"` are parsed but produce no game effect:

1. **Border Scouts** — `movement_range_bonus` (+1 move range)
2. **Religious Zeal** — `combat_bonus_vs_opposing_religion` (+10 vs other faith)
3. **Heavy Artillery** — `siege_combat_bonus` (+20 siege)
4. **Cavalry Tactics** — `cavalry_combat_bonus` (+20 cavalry combat)
5. **Grain Reserve** — `stability_bonus_winter` (+10 stability in winter)
6. **Holy War** — `war_declaration_faith_cost` (0 faith to declare war)
7. **The Golden Age** — `cultural_victory_progress` (cultural victory track)
8. **Grand Coalition** — `allow_alliance_sworn_enemies` (ally with enemies)
9. **The Last Stand** — `capital_defense_combat_bonus` (+30 capital defense)
10. **The Poet-Kings** — `trigger_event` (fire "A Golden Age Ends")
11. **Alliance with the Kindath** — `kindath_vassal` (Kindath vassal option)
12. **The Reconquista** — `control_hexes_victory_reduction` (-20 hex threshold)
13. **The Reconquista** — `trigger` (reconquista_active flag)

### 8 Civ Special Abilities (partially implemented)

Only combat-related abilities are wired up (regex parsing in `combat.ts:parseCivCombatAbilities`):
- **Cartada** "Units gain +5 combat strength when attacking" — **WORKS** (regex match)
- **Valledo** "Units defending in mountains gain +10 combat strength" — **WORKS** (regex match)

Not implemented:
1. **Ragosa** "Cultural Patronage: Gain +10% faith when constructing cultural buildings"
2. **Ragosa** "City of Scholars: Libraries cost 10 dinars less to build"
3. **Cartada** "City of Swords: Barracks cost 10 dinars less to build"
4. **Valledo** "Reconquista Drive: Gain +10 faith when capturing Asharite settlements"
5. **Ruenda** "Merchant Cavalry: Trade route income is boosted when horses are plentiful"
6. **Ruenda** "Sea Traders: Ports generate +2 extra trade_goods per turn"
7. **Kindath** "Diaspora Network: Generate +1 dinars from every friendly settlement"
8. **Kindath** "Silver Road: May offer trade deals with any civ regardless of diplomatic state"

### Other Gaps

- **`ResourceAllocationOrder`** — Defined in `types.ts` (line 216), included in `AnyOrder` union, but never processed by `turn-resolver.ts`
- **`offer_trade`** — Diplomatic action falls through to a no-op break statement in `diplomacy.ts:126`
- **Grain consumption always 0** — Uses `Math.floor(population / 100)` but settlement populations are 3-5, so consumption is always 0
- **No fog-of-war expansion** — `exploredBy` is set at game initialization (capital + 6 neighbors) and never updated during gameplay. Units moving into new territory don't reveal hexes.
- **`stability_zero` defeat is instant** — Theme says "stability at 0 for 2 consecutive turns" (`turnsAtZero: 2`) but engine eliminates immediately when `stability === 0` without tracking consecutive turns
- **No Muwardi unit spawning** — Events reference Muwardi invasion units but no spawn mechanic exists in the engine
- **Tension axes not tracked** — Theme defines Religious Fervor and Muwardi Threat tension axes but `GameState` has no `tensions` field and no engine code tracks or increments them
- **Multiplayer resolve race condition** — No locking or idempotency on turn resolution. If two players click "Resolve Turn" simultaneously, both read the same state, resolve independently, and the second write overwrites the first. Could double-resolve a turn or corrupt state. Most dangerous multiplayer bug.
- **`games.phase` column never updated to `completed`** — When victory fires, `game_state.phase` is set to `'completed'` inside the JSONB blob, but the `games.phase` column on the table row is never updated. The home page game list shows the game as "active" even after someone wins.
- **`turnsMissingOrders` is a dead field** — Initialized to 0 in `game-initializer.ts` but never incremented or read anywhere in the codebase
- **No incoming diplomatic message display** — DiplomacyPanel is send-only. Messages from other civs only appear in turn summary narrative, not in the diplomacy UI.
- **No unit stack splitting** — All units on a hex move together. No way to select or move individual units from a stack.

---

## Test Coverage

| Test File | Test Cases | Module Tested |
|-----------|-----------|---------------|
| `combat.test.ts` | 32 | Combat encounters, power calc, casualties, retreat, siege |
| `economy.test.ts` | 45 | Terrain yields, buildings, upkeep, seasons, interactions, tech multipliers |
| `events.test.ts` | 32 | Trigger evaluation, effect application, choice resolution |
| `turn-resolver.test.ts` | 19 | Full pipeline, movement, construction, recruitment, research, victory/defeat |
| `prng.test.ts` | 17 | Determinism, fork, weightedChoice, hashSeed |
| `map-generator.test.ts` | 17 | Grid generation, terrain, anchors, neighbors, determinism |
| `diplomacy.test.ts` | 17 | War, peace, alliance, truce, vassalage, mutual proposals |
| `ai-governor.test.ts` | 14 | Personality classification, order generation, target selection |
| **Total** | **193** | |

### Coverage Gaps

- **pathfinding.ts** — 0 tests (only module with none)
- **Zero UI/component tests** — No React component tests exist
- **No integration tests** — No end-to-end game flow tests

---

## Known Issues (from DEBUG_LOG.md)

9 entries, all resolved:

| # | Date | Issue | Status |
|---|------|-------|--------|
| 1 | 2026-02-19 | `profiles_1.email does not exist` on lobby load | Fixed |
| 2 | 2026-02-19 | Auth callback "No code found in URL" | Fixed |
| 3 | 2026-02-19 | Migration 001 fails: `game_players` referenced before created | Fixed |
| 4 | 2026-02-19 | Infinite recursion in `game_players` RLS policy | Fixed |
| 5 | 2026-02-19 | FK violation on `games.created_by` (missing profile) | Fixed |
| 6 | 2026-02-19 | Turn resolution ignores stored orders from DB | Fixed |
| 7 | 2026-02-20 | Map renders all dark gray (fog of war ignoring config) | Fixed |
| 8 | 2026-02-20 | Units can only move once ever (movesRemaining never reset) | Fixed |
| 9 | 2026-02-20 | Units move to illegal hex positions (Chebyshev instead of hex neighbors) | Fixed |

---

## UI Components (31 files)

### Generic UI (4)
`Button.tsx` (38 lines), `Input.tsx` (33), `Card.tsx` (17), `Spinner.tsx` (34)

### Lobby (7)
`CivCard.tsx` (47), `CivGrid.tsx` (27), `GameCard.tsx` (38), `GameList.tsx` (43), `InvitePanel.tsx` (39), `LobbyRoom.tsx` (120), `PlayerList.tsx` (50)

### Map (2)
`HexMap.tsx` (236), `TerrainLegend.tsx` (29)

### Game (10)
`CivDashboard.tsx` (100), `ResearchPanel.tsx` (134), `DiplomacyPanel.tsx` (168), `EventsPanel.tsx` (147), `BuildPanel.tsx` (156), `RecruitPanel.tsx` (104), `OrdersPanel.tsx` (139), `TurnSummaryPanel.tsx` (105), `TurnPanel.tsx` (165), `GameView.tsx` (243)

### Pages (8)
`layout.tsx` (22), `page.tsx` / HomePage (154), `create/page.tsx` (111), `game/[id]/page.tsx` (174), `game/[id]/pick-civ/page.tsx` (140), `auth/page.tsx` (80), `auth/callback/page.tsx` (98), `join/[id]/page.tsx` (191)

**Oversized components:** `GameView.tsx` (243 lines) and `HexMap.tsx` (236 lines) exceed the 150-line guideline.

---

## Database Schema

### Tables (6)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User accounts | id (FK auth.users), username, avatar_url |
| `games` | Game metadata | id, theme_id, name, phase (lobby/active/paused/completed), game_state (JSONB) |
| `game_players` | Player-game membership | game_id, player_id, civilization_id, is_ready |
| `turn_orders` | Submitted orders | game_id, player_id, civilization_id, turn_number, orders (JSONB) |
| `turn_history` | Resolved turn summaries | game_id, turn_number, summary (JSONB) |
| `invites` | Join invites | game_id, invite_code (auto hex), civilization_id, claimed_by |

### RLS Policies
- All 6 tables have RLS enabled
- `profiles`: anyone can SELECT, users UPDATE own row
- `games`: creator can INSERT, members can SELECT/UPDATE, any authenticated can read metadata
- `game_players`: any authenticated can SELECT (avoids self-referencing recursion), users INSERT/UPDATE own rows
- `turn_orders`: members SELECT, owner INSERT/UPDATE/DELETE
- `turn_history`: members SELECT/INSERT
- `invites`: anyone SELECT, members INSERT, claimer UPDATE

### Migrations
- `001_initial_schema.sql` — All 6 tables, RLS policies, indexes, `handle_new_user` trigger
- `002_join_policy.sql` — Fix join-flow access (creator SELECT, authenticated read, game_players open SELECT)

---

## Library Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Supabase client singleton (PKCE auth flow) |
| `src/lib/theme-loader.ts` | Theme loading and map (currently only al-rassan) |
| `src/lib/game-initializer.ts` | `initializeGameState` — builds initial `GameState` from theme + player assignments |
| `src/lib/hooks/useAuth.ts` | React hook for auth state (user, loading) |
| `src/lib/hooks/useGameState.ts` | React hook for game state from Supabase |
| `src/lib/utils.ts` | Shared helpers |

---

## Recent Changes (latest commit: 28968a2)

**"Gameplay polish: combat rework, recruitment, diplomacy, AI, economy, and UI improvements"** — 20 files changed, +1,623 / -238 lines:

- **Combat rework**: Casualty model (60/30%), morale damage, retreat BFS toward capital, siege bonuses, terrain/season modifiers, civ ability parsing
- **Recruitment system**: New `RecruitPanel.tsx`, 1 unit per settlement per turn, tech prereq filtering, cost checks
- **Diplomacy expansion**: Vassalage, truce duration, stability penalties for war declarations, faith cost for war
- **AI overhaul**: 4 personality types, full order generation (move/recruit/research/build/diplomacy), BFS pathfinding, threat assessment
- **Economy**: Resource interactions, seasonal modifiers, tech multipliers, building upkeep
- **Turn resolver**: Control transfer, healing, recruitment phases added; move reset; summary generation with resource deltas
- **UI**: Turn summary with combat/events/world news, CivDashboard resource deltas, OrdersPanel event notification badge

---

## Skeptic Agent Review

Three agents validated this document against the actual source code on 2026-02-20. Corrections have been folded into the sections above.

### Technical Code Agent (6 claims spot-checked)

| Claim | Verdict |
|-------|---------|
| Retreat uses BFS toward capital | CONFIRMED — `findRetreatHex` in combat.ts is textbook BFS with FIFO queue and parent chain |
| 30 techs (10 + 12 + 8) | CONFIRMED — exact count matches theme.json |
| Grain consumption always 0 | CONFIRMED — `floor(pop/100)` with pop 1-5 = always 0 |
| 193 tests across 8 files | CONFIRMED — exact match |
| stability_zero ignores turnsAtZero | CONFIRMED — theme says 2 turns, engine eliminates instantly |
| 14 custom tech effects ignored | DISCREPANCY — actual count is 13, not 14. **Corrected above.** |

### Core Gameplay Agent

**Verdict: Game is playable end-to-end for single player with AI opponents.** Document does not overstate.

- AI fill works correctly for all order types
- All 4 victory conditions can fire and are handled in the UI (gold "Game Over" banner, panels hidden)
- No obvious crash paths in a 10-turn playthrough

**New issues discovered (added to "What's Incomplete" above):**
- Multiplayer resolve race condition (HIGH risk) — no locking on turn resolution
- `games.phase` column never updated to `completed` — home page shows stale "active" status
- `turnsMissingOrders` is a dead field

**Risk assessment:**
- Single-player: low risk, fully functional
- Multiplayer: moderate risk due to resolve race condition
- Long games (50+ turns): low risk of slowdown from growing JSONB payload

### UX Agent (6 components verified)

All 6 components match document claims. No false capabilities found.

| Component | Matches? | Notes |
|-----------|----------|-------|
| RecruitPanel | Yes | Tech filtering works. Minor: queued costs not subtracted from displayed balance |
| TurnSummaryPanel | Yes | Shows narrative, deltas, combat, events, world news. World news only covers combat/eliminations, not diplomacy |
| CivDashboard | Yes | Resource deltas, stability bar, diplomatic relations all render correctly |
| EventsPanel | Yes | Event choices work, default labeling works |
| DiplomacyPanel | Yes | Send works, but no incoming message display |
| HexMap + GameView | Yes | Selection/movement fully wired. Limitation: no stack splitting, single-hop moves only |
