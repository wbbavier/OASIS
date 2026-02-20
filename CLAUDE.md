# CLAUDE.md — Civilization Simulation Game

## Project Identity

This is a **weekly turn-based civilization simulation game** playable in a browser by invited players. Games are themed to specific fictional or historical universes (e.g., The Lions of Al Rassan, Dune, A Song of Ice and Fire). The game runs entirely on free infrastructure with no AI API calls at runtime.

**Claude Code's role:** You are the primary developer. You write all code for this project. Follow this document strictly for architectural decisions, patterns, and conventions.

**Debugging protocol:**
- `DEBUG_LOG.md` in the repo root is the canonical record of every bug encountered in this project.
- **Before debugging any error:** read `DEBUG_LOG.md` first — the issue or a related pattern may already be documented.
- **After fixing any bug:** add a new entry to `DEBUG_LOG.md` using the template at the bottom of that file (symptom, root cause, fix, files changed, rule going forward).
- Treat the rules in `DEBUG_LOG.md` as hard constraints — never repeat a known anti-pattern.

---

## Architecture Rules (Non-Negotiable)

### Stack
- **Frontend:** React + TypeScript, deployed on Vercel (free tier)
- **Database & Auth:** Supabase (free tier PostgreSQL + Auth)
- **Styling:** Tailwind CSS
- **Game logic:** TypeScript, runs client-side in the browser
- **Theme packages:** JSON data files generated at game-creation time
- **No runtime AI calls.** The game must function with zero API calls to Claude or any LLM during gameplay.

### Deployment
- All code lives in a single GitHub repository
- Vercel auto-deploys from the `main` branch
- Environment variables (Supabase URL, anon key) are set in Vercel dashboard
- Never commit secrets or API keys to the repository

### Database
- All database interactions use the Supabase JS client (`@supabase/supabase-js`)
- Use Row Level Security (RLS) policies on every table
- Players should only be able to read their own civilization's hidden state (fog of war)
- Shared game state (map, public events, turn history) is readable by all players in that game
- Use Supabase Auth for player accounts and invite-based access

---

## Project Structure

```
/
├── CLAUDE.md                    # This file
├── PROJECT_ARCHITECTURE.md      # Full architecture reference
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vercel.json
├── .env.local.example           # Template for local env vars
├── src/
│   ├── app/                     # Next.js app router pages
│   │   ├── page.tsx             # Landing / game lobby
│   │   ├── game/[id]/page.tsx   # Active game view
│   │   └── create/page.tsx      # Game creation (theme selection)
│   ├── components/              # React components
│   │   ├── ui/                  # Generic UI (buttons, modals, cards)
│   │   ├── map/                 # Map rendering components
│   │   ├── game/                # Game-specific UI (turn panel, civ dashboard)
│   │   └── lobby/               # Lobby and invite components
│   ├── engine/                  # Core game logic (PURE FUNCTIONS, no side effects)
│   │   ├── types.ts             # All game type definitions
│   │   ├── turn-resolver.ts     # Turn resolution pipeline
│   │   ├── combat.ts            # Combat resolution
│   │   ├── economy.ts           # Resource calculations
│   │   ├── events.ts            # Event trigger and resolution
│   │   ├── diplomacy.ts         # Diplomatic action resolution
│   │   ├── map-generator.ts     # Procedural map generation
│   │   └── ai-governor.ts       # AI behavior for unsubmitted / NPC civs
│   ├── lib/                     # Utilities and integrations
│   │   ├── supabase.ts          # Supabase client setup
│   │   ├── theme-loader.ts      # Loads and validates theme packages
│   │   └── utils.ts             # Shared helpers
│   └── themes/                  # Theme packages (generated, checked in)
│       ├── schema.ts            # Theme package TypeScript interface
│       ├── al-rassan/           # Lions of Al Rassan theme
│       │   ├── theme.json       # Complete theme data
│       │   └── README.md        # Theme description and notes
│       └── _template/           # Blank template for new themes
│           └── theme.json
├── supabase/
│   └── migrations/              # Database migration SQL files
└── scripts/
    ├── generate-theme.ts        # Script to generate a new theme package
    └── keep-alive.ts            # Ping Supabase to prevent free tier pause
```

---

## Coding Conventions

### TypeScript
- Strict mode always (`"strict": true` in tsconfig)
- No `any` types. Use `unknown` and narrow, or define proper types
- All game engine functions are **pure** — they take state in, return new state out, no side effects
- Prefer `interface` over `type` for object shapes
- Use discriminated unions for game actions and events

### Game Engine
- **Every function in `src/engine/` must be pure.** No database calls, no async, no randomness without a seeded RNG passed as argument.
- Turn resolution is a pipeline: `GameState + PlayerOrders[] → GameState`
- All randomness uses a **seeded PRNG** (seed stored in game state) so turn resolution is deterministic and reproducible
- Combat, events, and economy are separate modules that the turn resolver orchestrates

### Components
- Functional components only, no class components
- Use Tailwind for styling, no CSS modules or styled-components
- Keep components small — if a component exceeds 150 lines, split it

### Database
- All Supabase queries go through `src/lib/supabase.ts`
- Never construct raw SQL in component code
- Always handle loading, error, and empty states in the UI

### Theme Packages
- Theme data is a single `theme.json` file conforming to the schema in `src/themes/schema.ts`
- Theme packages are **generated by Claude Code at game-creation time**, not at runtime
- A theme contains: civilizations, tech tree, event deck, resource definitions, map parameters, victory/defeat conditions, flavor text, and any mechanic modifiers
- The game engine reads theme data but never modifies it during gameplay

---

## Turn Resolution Order

When a turn resolves, process phases in this exact order:
1. **Diplomacy** — Process diplomatic messages, treaties, declarations of war
2. **Orders** — Validate and queue all player orders (movement, construction, research)
3. **Movement** — Resolve unit movement and detect conflicts
4. **Combat** — Resolve all combats (deterministic with seeded RNG)
5. **Economy** — Calculate resource production, upkeep, trade
6. **Construction** — Complete builds, start new constructions
7. **Research** — Advance tech/culture progress
8. **Events** — Check and fire conditional events from the theme's event deck
9. **Attrition & Stability** — Check for revolts, famine, morale collapse
10. **Victory/Defeat** — Check win/loss conditions
11. **Summary** — Generate turn summary text for each player

---

## What NOT To Do

- **Never add Claude API or OpenAI API calls** to any part of the runtime codebase
- **Never use `Math.random()` in game logic** — always use the seeded PRNG
- **Never store game logic in Supabase functions** — all logic is client-side TypeScript
- **Never create a real-time WebSocket system** — this is weekly turn-based only
- **Never add authentication methods beyond Supabase Auth** (no custom JWT, no OAuth providers beyond what Supabase offers)
- **Never install an ORM** — use the Supabase client directly
- **Never write CSS files** — use Tailwind utility classes only
