// Theme package TypeScript interface — defines the shape of a theme.json file.

import type { TerrainType, HexCoord, RelationshipState } from '@/engine/types';

// ---------------------------------------------------------------------------
// Map configuration (anchor-constrained generation)
// ---------------------------------------------------------------------------

export interface SettlementAnchor {
  id: string;
  name: string;
  type: 'capital' | 'city' | 'town' | 'outpost';
  approxCol: number;
  approxRow: number;
  civilizationId: string;
  isCapital: boolean;
  startingPopulation: number;
  startingStability: number;
  startingBuildings: string[];
}

export type MapZoneShape =
  | { kind: 'bounds'; minCol: number; maxCol: number; minRow: number; maxRow: number }
  | { kind: 'explicit'; hexes: HexCoord[] };

export interface MapZone {
  id: string;
  name: string;
  shape: MapZoneShape;
  terrainWeights: Partial<Record<TerrainType, number>>;
  initialControlledBy: string | null;
}

export interface MapConfig {
  cols: number;
  rows: number;
  settlementAnchors: SettlementAnchor[];
  zones: MapZone[];
  defaultTerrainWeights: Partial<Record<TerrainType, number>>;
  seaEdge: boolean;
}

// ---------------------------------------------------------------------------
// Civilization definitions (static theme data)
// ---------------------------------------------------------------------------

export interface StartingResources {
  [resourceId: string]: number;
}

export interface CivilizationDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
  religion?: string;
  startingResources: StartingResources;
  startingTechs: string[];
  uniqueUnits: string[];
  uniqueBuildings: string[];
  specialAbilities: string[];
  flavor: string;
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface ResourceDefinition {
  id: string;
  name: string;
  description: string;
  baseYield: number;
  terrainYields: Partial<Record<TerrainType, number>>;
}

// ---------------------------------------------------------------------------
// Tech tree
// ---------------------------------------------------------------------------

export type TechEffect =
  | { kind: 'unlock_unit'; unitDefinitionId: string }
  | { kind: 'unlock_building'; buildingDefinitionId: string }
  | { kind: 'resource_modifier'; resourceId: string; multiplier: number }
  | { kind: 'combat_modifier'; value: number }
  | { kind: 'stability_modifier'; value: number }
  | { kind: 'custom'; key: string; value: unknown };

export interface TechDefinition {
  id: string;
  name: string;
  description: string;
  cost: number;
  prerequisites: string[];
  effects: TechEffect[];
  era: string;
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

export interface BuildingEffect {
  resourceId: string;
  delta: number;
}

export interface BuildingDefinition {
  id: string;
  name: string;
  description: string;
  cost: number;
  upkeep: number;
  effects: BuildingEffect[];
  prerequisiteTech: string | null;
  maxPerSettlement: number;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export interface UnitDefinition {
  id: string;
  name: string;
  description: string;
  cost: number;
  upkeep: number;
  strength: number;
  morale: number;
  moves: number;
  prerequisiteTech: string | null;
  canGarrison: boolean;
  flavor: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventTrigger =
  | { kind: 'turn_number'; turn: number }
  | { kind: 'turn_range'; minTurn: number; maxTurn: number }
  | { kind: 'resource_below'; resourceId: string; threshold: number }
  | { kind: 'stability_below'; threshold: number }
  | { kind: 'tension_above'; axis: string; threshold: number }
  | { kind: 'tech_completed'; techId: string }
  | { kind: 'war_declared' }
  | { kind: 'always' };

export type EventEffect =
  | { kind: 'resource_delta'; resourceId: string; delta: number }
  | { kind: 'stability_delta'; delta: number }
  | { kind: 'tension_delta'; axis: string; delta: number }
  | { kind: 'spawn_unit'; unitDefinitionId: string; coord: HexCoord }
  | { kind: 'destroy_settlement'; settlementId: string }
  | { kind: 'force_war'; civId1: string; civId2: string }
  | { kind: 'narrative'; text: string }
  | { kind: 'custom'; key: string; value: unknown };

export interface EventChoice {
  id: string;
  label: string;
  effects: EventEffect[];
}

export interface EventDefinition {
  id: string;
  name: string;
  description: string;
  flavourText: string;
  trigger: EventTrigger;
  targetCivs: 'all' | 'random_one' | string[];
  choices: EventChoice[];
  defaultChoiceId: string;
  isRepeatable: boolean;
  weight: number;
}

// ---------------------------------------------------------------------------
// Diplomacy options
// ---------------------------------------------------------------------------

export interface DiplomacyOption {
  actionType: string;
  allowedStates: RelationshipState[];
  description: string;
}

// ---------------------------------------------------------------------------
// Victory / Defeat conditions
// ---------------------------------------------------------------------------

export type VictoryCondition =
  | { kind: 'eliminate_all' }
  | { kind: 'control_hexes'; count: number }
  | { kind: 'tech_advance'; techId: string }
  | { kind: 'survive_turns'; turns: number }
  | { kind: 'resource_accumulate'; resourceId: string; amount: number }
  | { kind: 'custom'; key: string; params: Record<string, unknown> };

export type DefeatCondition =
  | { kind: 'capital_lost' }
  | { kind: 'stability_zero'; turnsAtZero: number }
  | { kind: 'eliminated_by_combat' }
  | { kind: 'custom'; key: string; params: Record<string, unknown> };

// ---------------------------------------------------------------------------
// Mechanic modifiers
// ---------------------------------------------------------------------------

export interface TurnCycleEffect {
  phase: 'spring' | 'summer' | 'autumn' | 'winter' | string;
  resourceModifiers: Record<string, number>;
  combatModifier: number;
  stabilityModifier: number;
}

export interface MechanicModifiers {
  tensionAxes: Array<{ id: string; name: string; description: string; minValue: number; maxValue: number }>;
  combatModifiers: Record<string, number>;
  resourceInteractions: Array<{ sourceId: string; targetId: string; multiplier: number }>;
  turnCycleLength: number;
  turnCycleNames: string[];
  turnCycleEffects: TurnCycleEffect[];
}

// ---------------------------------------------------------------------------
// Flavor
// ---------------------------------------------------------------------------

export interface ThemeFlavor {
  turnName: string;
  currencyName: string;
  eraNames: string[];
  settingDescription: string;
}

// ---------------------------------------------------------------------------
// ThemePackage — top-level type for a theme.json
// ---------------------------------------------------------------------------

export interface ThemePackage {
  id: string;
  name: string;
  description: string;
  source: string;
  civilizations: CivilizationDefinition[];
  map: MapConfig;
  resources: ResourceDefinition[];
  techTree: TechDefinition[];
  buildings: BuildingDefinition[];
  units: UnitDefinition[];
  events: EventDefinition[];
  diplomacyOptions: DiplomacyOption[];
  victoryConditions: VictoryCondition[];
  defeatConditions: DefeatCondition[];
  mechanics: MechanicModifiers;
  flavor: ThemeFlavor;
}
