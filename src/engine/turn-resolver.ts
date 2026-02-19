// Turn resolution pipeline — orchestrates all 11 phases in order.
// Phase 1: all non-trivial phases are stubs returning state unchanged.

import type {
  GameState,
  PlayerOrders,
  PRNG,
  ResolutionLog,
  ResolutionPhase,
  TurnSummary,
} from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { fillMissingOrdersWithAI } from '@/engine/ai-governor';
import { resolveDiplomacy } from '@/engine/diplomacy';
import { resolveCombat } from '@/engine/combat';
import { resolveEconomy } from '@/engine/economy';
import { resolveEvents } from '@/engine/events';

export interface TurnResolutionResult {
  state: GameState;
  logs: ResolutionLog[];
}

// ---------------------------------------------------------------------------
// Local stubs for phases not yet extracted to their own modules
// ---------------------------------------------------------------------------

function validateOrders(
  state: GameState,
  _orders: PlayerOrders[],
  _theme: ThemePackage
): { state: GameState; log: ResolutionLog } {
  return {
    state,
    log: { phase: 'orders', messages: ['Orders validated (stub)'] },
  };
}

function resolveMovement(
  state: GameState,
  _orders: PlayerOrders[],
  _theme: ThemePackage
): { state: GameState; log: ResolutionLog } {
  return {
    state,
    log: { phase: 'movement', messages: ['Movement resolved (stub)'] },
  };
}

function resolveConstruction(
  state: GameState,
  _orders: PlayerOrders[],
  _theme: ThemePackage
): { state: GameState; log: ResolutionLog } {
  return {
    state,
    log: { phase: 'construction', messages: ['Construction resolved (stub)'] },
  };
}

function resolveResearch(
  state: GameState,
  _orders: PlayerOrders[],
  _theme: ThemePackage
): { state: GameState; log: ResolutionLog } {
  return {
    state,
    log: { phase: 'research', messages: ['Research resolved (stub)'] },
  };
}

function resolveAttrition(
  state: GameState,
  _theme: ThemePackage
): { state: GameState; log: ResolutionLog } {
  return {
    state,
    log: { phase: 'attrition', messages: ['Attrition resolved (stub)'] },
  };
}

function checkVictoryDefeat(
  state: GameState,
  _theme: ThemePackage
): { state: GameState; log: ResolutionLog } {
  return {
    state,
    log: { phase: 'victory_defeat', messages: ['Victory/defeat checked (stub)'] },
  };
}

function generateSummary(
  state: GameState,
  _theme: ThemePackage
): { state: GameState; log: ResolutionLog; summary: TurnSummary } {
  const summary: TurnSummary = {
    turnNumber: state.turn,
    resolvedAt: new Date().toISOString(),
    entries: Object.keys(state.civilizations).map((civId) => ({
      civId,
      narrativeLines: [`Turn ${state.turn} complete.`],
      resourceDeltas: {},
      eventsActivated: [],
      combatResults: [],
      techCompleted: null,
      eliminated: state.civilizations[civId].isEliminated,
    })),
  };
  return {
    state,
    log: { phase: 'summary', messages: ['Summary generated (stub)'] },
    summary,
  };
}

// ---------------------------------------------------------------------------
// Helper — wrap a phase step and record a log entry
// ---------------------------------------------------------------------------

function logPhase(phase: ResolutionPhase, messages: string[]): ResolutionLog {
  return { phase, messages };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export function resolveTurn(
  state: GameState,
  submittedOrders: PlayerOrders[],
  theme: ThemePackage,
  prng: PRNG
): TurnResolutionResult {
  const logs: ResolutionLog[] = [];
  let s = state;

  // Phase 1: Fill missing orders with AI
  const allOrders = fillMissingOrdersWithAI(s, submittedOrders, theme, prng.fork());
  logs.push(logPhase('orders', [`AI filled orders for ${allOrders.length - submittedOrders.length} civilization(s)`]));

  // Phase 2: Diplomacy
  s = resolveDiplomacy(s, allOrders, theme);
  logs.push(logPhase('diplomacy', ['Diplomacy resolved']));

  // Phase 3: Validate orders
  const validationResult = validateOrders(s, allOrders, theme);
  s = validationResult.state;
  logs.push(validationResult.log);

  // Phase 4: Movement
  const movementResult = resolveMovement(s, allOrders, theme);
  s = movementResult.state;
  logs.push(movementResult.log);

  // Phase 5: Combat
  s = resolveCombat(s, theme, prng.fork());
  logs.push(logPhase('combat', ['Combat resolved']));

  // Phase 6: Economy
  s = resolveEconomy(s, theme);
  logs.push(logPhase('economy', ['Economy resolved']));

  // Phase 7: Construction
  const constructionResult = resolveConstruction(s, allOrders, theme);
  s = constructionResult.state;
  logs.push(constructionResult.log);

  // Phase 8: Research
  const researchResult = resolveResearch(s, allOrders, theme);
  s = researchResult.state;
  logs.push(researchResult.log);

  // Phase 9: Events
  s = resolveEvents(s, theme, prng.fork());
  logs.push(logPhase('events', ['Events resolved']));

  // Phase 10: Attrition & Stability
  const attritionResult = resolveAttrition(s, theme);
  s = attritionResult.state;
  logs.push(attritionResult.log);

  // Phase 11: Victory/Defeat
  const victoryResult = checkVictoryDefeat(s, theme);
  s = victoryResult.state;
  logs.push(victoryResult.log);

  // Phase 12: Summary
  const summaryResult = generateSummary(s, theme);
  s = summaryResult.state;
  logs.push(summaryResult.log);

  // Advance turn counter and persist RNG state
  const resolved: GameState = {
    ...s,
    turn: s.turn + 1,
    rngState: prng.state,
    lastResolvedAt: new Date().toISOString(),
    turnHistory: [...s.turnHistory, summaryResult.summary],
  };

  return { state: resolved, logs };
}
