# Project Architecture — Civilization Simulation Game

## Overview

A weekly turn-based civilization simulation game, playable in the browser by invited players. Each game instance is themed to a specific fictional or historical universe, shaping civilizations, events, mechanics, and narrative. The game is built and deployed entirely on free-tier infrastructure.

---

## Design Philosophy

**Claude builds it, then it runs itself.** Claude Code generates the codebase, theme packages, and all game content at development/creation time. During gameplay, no AI calls are made — the game runs as deterministic code against authored data.

**Concrete first, abstract second.** The first theme (Lions of Al Rassan) is built as a real, playable game. The universal theme schema is extracted from that concrete example, not designed in the abstract.

**Weekly cadence drives every decision.** Players have days, not seconds, to decide. This means no real-time sync, no WebSockets, no latency concerns. It also means the UI can be simple — it's closer to a board game dashboard than a video game.

---

## Tech Stack

| Layer | Technology | Free Tier Limits | Our Usage |
|-------|-----------|-----------------|-----------|
| Framework | Next.js (React + TypeScript) | N/A (open source) | App framework |
| Hosting | Vercel Hobby | 100GB bandwidth/mo, 10s serverless timeout | Static pages + optional API routes |
| Database | Supabase Free | 500MB storage, pauses after 7d inactivity | Game state, auth, turn history |
| Auth | Supabase Auth | 50,000 MAU | Player accounts, invite links |
| Styling | Tailwind CSS | N/A (open source) | All UI styling |
| Version Control | GitHub | Unlimited public repos | Code, theme packages, CI |
| Keep-Alive | GitHub Actions | 2,000 min/mo free | Cron ping to Supabase every 5 days |

### Why These Choices

**Next.js** — Industry standard React framework. Vercel deploys it natively with zero config. Gives us file-based routing, server-side rendering if we need it, and API routes as an escape hatch if client-side logic ever needs to move server-side.

**Supabase** — Gives us Postgres, auth, and a JavaScript client library in one free package. The alternative would be wiring together separate auth, database, and API services, which is more complexity for no benefit at this scale.

**Tailwind** — Prevents CSS inconsistency across Claude Code sessions. Utility classes are explicit and don't accumulate conflicting stylesheets over time.

---

## Database Schema

### Tables

```sql
-- Players (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users primary key,
  display_name text not null,
  created_at timestamptz default now()
);

-- Game instances
create table public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  theme_id text not null,               -- e.g., "al-rassan"
  status text not null default 'lobby', -- lobby | active | paused | completed
  config jsonb not null,                -- game settings (map size, difficulty, etc.)
  current_turn integer not null default 0,
  turn_deadline timestamptz,            -- when current turn auto-resolves
  game_state jsonb not null,            -- full serialized GameState
  rng_seed text not null,               -- seed for deterministic randomness
  created_by uuid references public.profiles not null,
  created_at timestamptz default now()
);

-- Player membership in games
create table public.game_players (
  game_id uuid references public.games on delete cascade,
  player_id uuid references public.profiles,
  civilization_id text not null,         -- references theme's civilization
  is_active boolean default true,        -- false if player dropped out
  joined_at timestamptz default now(),
  primary key (game_id, player_id)
);

-- Turn submissions
create table public.turn_orders (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games on delete cascade,
  player_id uuid references public.profiles,
  turn_number integer not null,
  orders jsonb not null,                 -- serialized PlayerOrders
  submitted_at timestamptz default now(),
  unique (game_id, player_id, turn_number)
);

-- Turn history (resolved turns, for review)
create table public.turn_history (
  game_id uuid references public.games on delete cascade,
  turn_number integer not null,
  summary jsonb not null,                -- per-player turn summaries
  state_snapshot jsonb,                  -- optional: full state for replay
  resolved_at timestamptz default now(),
  primary key (game_id, turn_number)
);

-- Invite links
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games on delete cascade,
  invite_code text unique not null,
  used_by uuid references public.profiles,
  created_at timestamptz default now()
);
```

### Row Level Security Principles

- Players can only read `game_state` for games they are a member of
- Players can only insert `turn_orders` for their own `player_id`
- Players can read `turn_history` for their own games
- The `game_state` JSON contains both public and per-civilization data; the client filters what to show (fog of war is UI-level, not DB-level, for simplicity in v1)
- Game creators can manage invites for their games

### Note on Fog of War

True server-side fog of war (where the database never sends hidden data to unauthorized players) requires server-side filtering, which adds complexity. For v1, the full game state is sent to all players in a game, and the **client** renders only what each player should see. This is acceptable because:
1. These are invited friends, not adversarial strangers
2. "Cheating" requires inspecting browser dev tools — low risk in a casual weekly game
3. Moving to server-side fog of war later means adding a Supabase function or Vercel API route — it's an additive change, not a rewrite

---

## Theme Package Schema

A theme package is a JSON file that fully describes a themed game variant. The game engine reads this data but never modifies it.

```typescript
interface ThemePackage {
  // Metadata
  id: string;                    // e.g., "al-rassan"
  name: string;                  // e.g., "The Lions of Al Rassan"
  description: string;           // Flavor text for game creation screen
  source: string;                // "Based on the novel by Guy Gavriel Kay"
  
  // Civilizations
  civilizations: Civilization[]; // 3-8 playable civilizations
  
  // Map generation
  map: MapConfig;                // Parameters for procedural generation
  
  // Resources
  resources: ResourceDefinition[];
  
  // Tech / culture tree
  techTree: TechNode[];
  
  // Event deck
  events: GameEvent[];           // Conditional narrative events
  
  // Diplomatic options
  diplomacyOptions: DiplomacyAction[];
  
  // Victory and defeat
  victoryConditions: VictoryCondition[];
  defeatConditions: DefeatCondition[];
  
  // Mechanic modifiers (optional overrides to base engine behavior)
  mechanics: MechanicModifiers;
  
  // Flavor
  flavor: {
    turnName: string;            // e.g., "Season" instead of "Turn"
    currencyName: string;        // e.g., "Dinars" instead of "Gold"
    eraNames: string[];          // e.g., ["The Fragile Peace", "The Unraveling", ...]
  };
}

interface Civilization {
  id: string;
  name: string;
  description: string;
  traits: CivTrait[];           // Mechanical bonuses/penalties
  startingResources: Record<string, number>;
  startingUnits: UnitPlacement[];
  relationships: Record<string, RelationshipState>; // Starting diplomatic state
  flavorText: {
    greeting: string;
    warDeclaration: string;
    defeat: string;
    victory: string;
  };
}

interface GameEvent {
  id: string;
  name: string;
  description: string;          // Narrative text shown to affected player(s)
  trigger: EventTrigger;        // Condition that fires this event
  effects: EventEffect[];       // Mechanical consequences
  choices?: EventChoice[];      // Optional player choices (otherwise auto-resolves)
  oneTime: boolean;             // Can this fire more than once?
  targetScope: 'global' | 'civilization' | 'region';
}

interface MechanicModifiers {
  // Tension axes — abstract systems that themes can define
  tensionAxes?: TensionAxis[];  // e.g., Religious conflict, factional loyalty
  
  // Combat modifiers
  combatModifiers?: CombatModifier[];
  
  // Custom resource interactions
  resourceInteractions?: ResourceInteraction[];
  
  // Turn structure changes (e.g., seasons matter)
  turnCycleLength?: number;     // If turns have a repeating cycle (e.g., 4 for seasons)
  turnCycleNames?: string[];    // e.g., ["Spring", "Summer", "Autumn", "Winter"]
  turnCycleEffects?: Record<string, Partial<ResourceModifier>>[];
}

interface TensionAxis {
  id: string;
  name: string;                 // e.g., "Religious Tension"
  description: string;
  min: number;                  // Typically 0
  max: number;                  // Typically 100
  startingValue: number;
  perCivilization: boolean;     // Each civ has own value, or one global value?
  thresholds: TensionThreshold[]; // Effects triggered at certain levels
}
```

### Theme Generation Process

1. Developer (you) tells Claude Code: "Generate a theme package for [universe]"
2. Claude Code reads the schema, researches/recalls the universe, and generates `theme.json`
3. You review and tweak the JSON (civilization balance, event triggers, difficulty)
4. The theme is committed to the repo under `src/themes/[theme-id]/`
5. When a player creates a game with this theme, the engine loads the JSON and initializes game state

---

## Game Flow

### Creating a Game

1. Game creator signs in (Supabase Auth — email/password or magic link)
2. Selects a theme from available themes
3. Configures settings (map size, number of players, turn deadline policy)
4. Creates the game → enters lobby state
5. Gets invite links to share with friends

### Joining a Game

1. Invited player clicks invite link
2. Signs up or signs in via Supabase Auth
3. Picks a civilization (from those available in the theme)
4. Enters the game lobby
5. When all slots are filled (or creator starts with available players + AI), game begins

### Playing a Turn

1. Player opens the game page and sees:
   - Map with their known territories and fog of war
   - Civilization dashboard (resources, units, tech, stability)
   - Events requiring decisions
   - Diplomatic inbox (messages from other players)
   - Turn orders panel
2. Player submits orders:
   - Move/deploy units
   - Allocate resources (construction, research, military, culture)
   - Respond to events (if choices available)
   - Send diplomatic messages / propose treaties
   - Set priorities for AI governor (if they can't submit next turn)
3. Orders are saved to `turn_orders` table
4. Player can revise orders until the deadline

### Resolving a Turn

Turn resolution is triggered when:
- All active players have submitted orders, OR
- The turn deadline expires

Resolution process:
1. The triggering client (last submitter or deadline checker) fetches all orders and current game state
2. Runs the turn resolution pipeline (client-side, deterministic)
3. Writes the new `game_state` and `turn_history` to Supabase
4. Advances `current_turn` and sets new `turn_deadline`

**Who runs resolution?** In v1, the client that triggers resolution runs it. This works because the pipeline is deterministic — any client running it with the same inputs produces the same output. If there's a conflict (two clients trigger simultaneously), Supabase's row-level locking on the `games` table prevents double-resolution.

---

## Difficulty and Failure Design

### Core Principle: The Universe Pushes Back

Games should have a "historical gravity" — the narrative forces of the universe create pressure that players must actively resist or adapt to. Passive play leads to decline and failure.

### Failure Modes (Players Can Lose In Multiple Ways)

1. **Conquest** — Military defeat by another civilization
2. **Economic Collapse** — Resources drop below sustainable levels for 3+ consecutive turns
3. **Cultural Erosion** — Cultural influence drops below threshold (assimilated by neighbors)
4. **Internal Revolt** — Stability drops too low, triggering civil war or fragmentation
5. **Narrative Defeat** — Theme-specific conditions (e.g., in Al Rassan, a civilization may be "defeated" by forced exile or religious persecution it cannot prevent)

### Difficulty Levers

- **Event deck weighting** — More crises, fewer windfalls
- **Starting asymmetry** — Civilizations are NOT balanced; some start advantaged, reflecting the universe
- **Attrition rates** — Higher maintenance costs, faster stability decay
- **AI aggression** — NPC civilizations pursue goals more aggressively
- **Tension axis volatility** — Theme-specific tension systems escalate faster

### The AI Governor

When a player doesn't submit orders by the deadline, an AI governor makes decisions for them. The AI governor is NOT intelligent — it follows simple heuristic rules:
- Maintain current military positions (no movement)
- Allocate resources proportionally to last turn's allocation
- Accept no diplomatic proposals
- Make no event choices (default outcome applies)

This is intentionally conservative. Missing a turn should be costly but not immediately fatal. The AI governor keeps you alive but doesn't advance your position.

---

## Development Phases

### Phase 0: Skeleton Deploy (Do This First)
- Create Next.js project with TypeScript and Tailwind
- Connect to Supabase (create project, add env vars)
- Deploy to Vercel from GitHub
- Verify: a blank page loads at a public URL with a working DB read
- Set up GitHub Actions keep-alive cron for Supabase

### Phase 1: Foundation Engine
- Implement core types (`src/engine/types.ts`)
- Implement theme package schema (`src/themes/schema.ts`)
- Build map generator (hex grid, procedural terrain)
- Build turn resolution pipeline (skeleton — each phase as a no-op that passes state through)
- Build seeded PRNG utility
- Write tests for engine functions

### Phase 2: Al Rassan Theme
- Generate the Lions of Al Rassan theme package
- Define civilizations (Jaddites, Asharites, Kindath, and sub-factions)
- Build the religious tension axis mechanic
- Create the event deck (30-50 events with triggers and consequences)
- Define tech/culture tree appropriate to the setting
- Balance starting positions and resources

### Phase 3: Single Player Playable
- Build game UI: map view, civilization dashboard, turn orders panel
- Wire up Supabase: game creation, state persistence, turn submission
- Implement turn resolution with real game logic (not skeleton)
- Implement AI governor for NPC civilizations
- Playtest solo against AI civs

### Phase 4: Multiplayer
- Implement Supabase Auth (sign up, sign in, magic links)
- Build game lobby and invite system
- Implement multi-player turn submission and deadline management
- Build diplomatic messaging between players
- Implement concurrent-resolution safety (prevent double-resolution race condition)

### Phase 5: Theme Abstraction
- Extract the universal schema from the Al Rassan implementation
- Create the blank theme template
- Generate a second theme (user's choice) to validate the schema
- Document theme creation process

---

## Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|-----------|
| Supabase free tier pauses DB | Medium | High | GitHub Actions cron ping every 5 days |
| Turn resolution exceeds browser performance | Low | Low | Weekly turns mean small state; optimize only if measured |
| Theme schema too rigid for diverse universes | Medium | Medium | Build 2 concrete themes before finalizing schema |
| Scope creep on game mechanics | High | High | Each phase must be playable before next phase starts |
| Vercel serverless timeout if we move logic server-side | Medium | Low | Client-side resolution avoids this entirely in v1 |
| Inconsistent code from multiple Claude Code sessions | Medium | Medium | CLAUDE.md + strict project structure + TypeScript strict mode |
| Players lose interest due to weekly pace | Medium | Medium | Game design problem, not technical — tighten event pacing |

---

## Key Decisions Log

| Decision | Rationale | Revisit If... |
|----------|-----------|--------------|
| Client-side turn resolution | Simpler, no serverless limits, deterministic | We need adversarial security (strangers playing) |
| No runtime AI calls | Zero budget constraint | Budget changes and AI-narrated events become desired |
| Weekly turns only | Core design requirement, simplifies everything | Players want faster cadence |
| Supabase for all backend needs | Single free service vs. stitching together multiple | We hit free tier limits |
| Next.js + Vercel | Tightest integration, simplest deploy | Vercel changes free tier terms |
| Fog of war is client-side only | Friends game, low cheat risk, much simpler | We open to public players |
| Theme data is static JSON, not DB | Simpler, versioned in git, no runtime generation | We want user-generated themes via a web UI |
