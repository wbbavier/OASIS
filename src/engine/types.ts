// All game type definitions for the civilization simulation engine.

// ---------------------------------------------------------------------------
// PRNG (interface only — implementation in prng.ts)
// ---------------------------------------------------------------------------

export interface PRNG {
  next(): number;
  nextInt(min: number, max: number): number;
  fork(): PRNG;
  readonly state: number;
}

// ---------------------------------------------------------------------------
// Map primitives
// ---------------------------------------------------------------------------

export type TerrainType =
  | 'plains'
  | 'mountains'
  | 'forest'
  | 'desert'
  | 'coast'
  | 'sea'
  | 'river';

export interface HexCoord {
  col: number;
  row: number;
}

export interface ResourceDeposit {
  resourceId: string;
  amount: number;
}

export interface Settlement {
  id: string;
  name: string;
  type: 'capital' | 'city' | 'town' | 'outpost';
  population: number;
  stability: number;
  buildings: string[];
  isCapital: boolean;
}

export interface Unit {
  id: string;
  definitionId: string;
  civilizationId: string;
  strength: number;
  morale: number;
  movesRemaining: number;
  isGarrisoned: boolean;
}

export interface Hex {
  coord: HexCoord;
  terrain: TerrainType;
  settlement: Settlement | null;
  controlledBy: string | null;
  units: Unit[];
  resources: ResourceDeposit[];
  exploredBy: string[];
}

// ---------------------------------------------------------------------------
// Civilization runtime state
// ---------------------------------------------------------------------------

export type RelationshipState =
  | 'peace'
  | 'alliance'
  | 'war'
  | 'truce'
  | 'vassal';

export interface CivilizationState {
  id: string;
  playerId: string | null;
  resources: Record<string, number>;
  techProgress: Record<string, number>;
  completedTechs: string[];
  culturalInfluence: number;
  stability: number;
  diplomaticRelations: Record<string, RelationshipState>;
  tensionAxes: Record<string, number>;
  isEliminated: boolean;
  turnsMissingOrders: number;
}

// ---------------------------------------------------------------------------
// Events (runtime instances)
// ---------------------------------------------------------------------------

export interface ActiveEvent {
  instanceId: string;
  definitionId: string;
  targetCivilizationIds: string[];
  activatedOnTurn: number;
  expiresOnTurn: number | null;
  responses: Record<string, string>;
  resolved: boolean;
}

// ---------------------------------------------------------------------------
// Turn summary
// ---------------------------------------------------------------------------

export interface CombatResultSummary {
  attackerCivId: string;
  defenderCivId: string;
  coord: HexCoord;
  attackerStrengthLost: number;
  defenderStrengthLost: number;
  outcome: 'attacker_wins' | 'defender_wins' | 'draw';
}

export interface TurnSummaryEntry {
  civId: string;
  narrativeLines: string[];
  resourceDeltas: Record<string, number>;
  eventsActivated: string[];
  combatResults: CombatResultSummary[];
  techCompleted: string | null;
  eliminated: boolean;
}

export interface TurnSummary {
  turnNumber: number;
  resolvedAt: string;
  entries: TurnSummaryEntry[];
}

// ---------------------------------------------------------------------------
// Game state (serialized to Supabase JSONB)
// ---------------------------------------------------------------------------

export type GamePhase = 'lobby' | 'active' | 'paused' | 'completed';

export interface GameConfig {
  maxTurns: number | null;
  turnDeadlineDays: number;
  allowAIGovernor: boolean;
  difficultyModifier: number;
  fogOfWar: boolean;
}

export interface GameState {
  gameId: string;
  themeId: string;
  turn: number;
  phase: GamePhase;
  map: Hex[][];
  civilizations: Record<string, CivilizationState>;
  activeEvents: ActiveEvent[];
  turnHistory: TurnSummary[];
  rngSeed: number;
  rngState: number;
  config: GameConfig;
  createdAt: string;
  lastResolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Player orders — discriminated union
// ---------------------------------------------------------------------------

export interface MoveOrder {
  kind: 'move';
  unitId: string;
  path: HexCoord[];
}

export interface ConstructionOrder {
  kind: 'construction';
  settlementId: string;
  buildingDefinitionId: string;
}

export interface ResearchOrder {
  kind: 'research';
  techId: string;
  pointsAllocated: number;
}

export type DiplomaticActionType =
  | 'propose_peace'
  | 'propose_alliance'
  | 'declare_war'
  | 'propose_truce'
  | 'propose_vassalage'
  | 'send_message'
  | 'offer_trade'
  | 'break_alliance';

export interface DiplomaticAction {
  kind: 'diplomatic';
  actionType: DiplomaticActionType;
  targetCivId: string;
  payload: Record<string, unknown>;
}

export interface EventResponse {
  kind: 'event_response';
  eventInstanceId: string;
  choiceId: string;
}

export interface ResourceAllocationOrder {
  kind: 'resource_allocation';
  allocations: Record<string, number>;
}

export type AnyOrder =
  | MoveOrder
  | ConstructionOrder
  | ResearchOrder
  | DiplomaticAction
  | EventResponse
  | ResourceAllocationOrder;

export interface PlayerOrders {
  playerId: string;
  civilizationId: string;
  turnNumber: number;
  orders: AnyOrder[];
  submittedAt: string;
}

// ---------------------------------------------------------------------------
// Pipeline types
// ---------------------------------------------------------------------------

export type ResolutionPhase =
  | 'diplomacy'
  | 'orders'
  | 'movement'
  | 'combat'
  | 'economy'
  | 'construction'
  | 'research'
  | 'events'
  | 'attrition'
  | 'victory_defeat'
  | 'summary';

export interface ResolutionLog {
  phase: ResolutionPhase;
  messages: string[];
}
