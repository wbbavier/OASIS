// Zod schema for runtime validation of theme.json files.
// Mirrors the TypeScript interfaces in src/themes/schema.ts.

import { z } from 'zod';

const hexCoordSchema = z.object({ col: z.number(), row: z.number() });

const terrainTypeSchema = z.enum(['plains', 'mountains', 'forest', 'desert', 'coast', 'sea', 'river']);

const settlementAnchorSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['capital', 'city', 'town', 'outpost']),
  approxCol: z.number(),
  approxRow: z.number(),
  civilizationId: z.string(),
  isCapital: z.boolean(),
  startingPopulation: z.number(),
  startingStability: z.number(),
  startingBuildings: z.array(z.string()),
});

const mapZoneShapeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('bounds'),
    minCol: z.number(), maxCol: z.number(),
    minRow: z.number(), maxRow: z.number(),
  }),
  z.object({
    kind: z.literal('explicit'),
    hexes: z.array(hexCoordSchema),
  }),
]);

const mapZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  shape: mapZoneShapeSchema,
  terrainWeights: z.record(z.string(), z.number()),
  initialControlledBy: z.string().nullable(),
});

const mapConfigSchema = z.object({
  cols: z.number(),
  rows: z.number(),
  settlementAnchors: z.array(settlementAnchorSchema),
  zones: z.array(mapZoneSchema),
  defaultTerrainWeights: z.record(z.string(), z.number()),
  seaEdge: z.boolean(),
});

const civDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  religion: z.string().optional(),
  startingResources: z.record(z.string(), z.number()),
  startingTechs: z.array(z.string()),
  uniqueUnits: z.array(z.string()),
  uniqueBuildings: z.array(z.string()),
  specialAbilities: z.array(z.string()),
  flavor: z.string(),
});

const resourceDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  baseYield: z.number(),
  terrainYields: z.record(z.string(), z.number()),
});

const techEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unlock_unit'), unitDefinitionId: z.string() }),
  z.object({ kind: z.literal('unlock_building'), buildingDefinitionId: z.string() }),
  z.object({ kind: z.literal('resource_modifier'), resourceId: z.string(), multiplier: z.number() }),
  z.object({ kind: z.literal('combat_modifier'), value: z.number() }),
  z.object({ kind: z.literal('stability_modifier'), value: z.number() }),
  z.object({ kind: z.literal('custom'), key: z.string(), value: z.unknown() }),
]);

const techDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  cost: z.number(),
  prerequisites: z.array(z.string()),
  effects: z.array(techEffectSchema),
  era: z.string(),
});

const buildingEffectSchema = z.object({
  resourceId: z.string(),
  delta: z.number(),
});

const buildingDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  cost: z.number(),
  upkeep: z.number(),
  effects: z.array(buildingEffectSchema),
  prerequisiteTech: z.string().nullable(),
  maxPerSettlement: z.number(),
});

const unitDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  cost: z.number(),
  upkeep: z.number(),
  strength: z.number(),
  morale: z.number(),
  moves: z.number(),
  prerequisiteTech: z.string().nullable(),
  canGarrison: z.boolean(),
  flavor: z.string(),
});

const eventTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turn_number'), turn: z.number() }),
  z.object({ kind: z.literal('turn_range'), minTurn: z.number(), maxTurn: z.number() }),
  z.object({ kind: z.literal('resource_below'), resourceId: z.string(), threshold: z.number() }),
  z.object({ kind: z.literal('stability_below'), threshold: z.number() }),
  z.object({ kind: z.literal('tension_above'), axis: z.string(), threshold: z.number() }),
  z.object({ kind: z.literal('tech_completed'), techId: z.string() }),
  z.object({ kind: z.literal('war_declared') }),
  z.object({ kind: z.literal('always') }),
]);

const eventEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resource_delta'), resourceId: z.string(), delta: z.number() }),
  z.object({ kind: z.literal('stability_delta'), delta: z.number() }),
  z.object({ kind: z.literal('tension_delta'), axis: z.string(), delta: z.number() }),
  z.object({ kind: z.literal('spawn_unit'), unitDefinitionId: z.string(), coord: hexCoordSchema }),
  z.object({ kind: z.literal('destroy_settlement'), settlementId: z.string() }),
  z.object({ kind: z.literal('force_war'), civId1: z.string(), civId2: z.string() }),
  z.object({ kind: z.literal('narrative'), text: z.string() }),
  z.object({ kind: z.literal('custom'), key: z.string(), value: z.unknown() }),
]);

const eventChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  effects: z.array(eventEffectSchema),
});

const eventDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  flavourText: z.string(),
  trigger: eventTriggerSchema,
  targetCivs: z.union([z.literal('all'), z.literal('random_one'), z.array(z.string())]),
  choices: z.array(eventChoiceSchema),
  defaultChoiceId: z.string(),
  isRepeatable: z.boolean(),
  weight: z.number(),
});

const relationshipStateSchema = z.enum(['peace', 'alliance', 'war', 'truce', 'vassal']);

const diplomacyOptionSchema = z.object({
  actionType: z.string(),
  allowedStates: z.array(relationshipStateSchema),
  description: z.string(),
});

const victoryConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('eliminate_all') }),
  z.object({ kind: z.literal('control_hexes'), count: z.number() }),
  z.object({ kind: z.literal('tech_advance'), techId: z.string() }),
  z.object({ kind: z.literal('survive_turns'), turns: z.number() }),
  z.object({ kind: z.literal('resource_accumulate'), resourceId: z.string(), amount: z.number() }),
  z.object({ kind: z.literal('custom'), key: z.string(), params: z.record(z.string(), z.unknown()) }),
]);

const defeatConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('capital_lost') }),
  z.object({ kind: z.literal('stability_zero'), turnsAtZero: z.number() }),
  z.object({ kind: z.literal('eliminated_by_combat') }),
  z.object({ kind: z.literal('custom'), key: z.string(), params: z.record(z.string(), z.unknown()) }),
]);

const turnCycleEffectSchema = z.object({
  phase: z.string(),
  resourceModifiers: z.record(z.string(), z.number()),
  combatModifier: z.number(),
  stabilityModifier: z.number(),
});

const mechanicModifiersSchema = z.object({
  tensionAxes: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string(),
    minValue: z.number(), maxValue: z.number(),
  })),
  combatModifiers: z.record(z.string(), z.number()),
  resourceInteractions: z.array(z.object({
    sourceId: z.string(), targetId: z.string(), multiplier: z.number(),
  })),
  turnCycleLength: z.number(),
  turnCycleNames: z.array(z.string()),
  turnCycleEffects: z.array(turnCycleEffectSchema),
});

const themeFlavorSchema = z.object({
  turnName: z.string(),
  currencyName: z.string(),
  eraNames: z.array(z.string()),
  settingDescription: z.string(),
});

export const themePackageSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  source: z.string(),
  civilizations: z.array(civDefSchema),
  map: mapConfigSchema,
  resources: z.array(resourceDefSchema),
  techTree: z.array(techDefSchema),
  buildings: z.array(buildingDefSchema),
  units: z.array(unitDefSchema),
  events: z.array(eventDefSchema),
  diplomacyOptions: z.array(diplomacyOptionSchema),
  victoryConditions: z.array(victoryConditionSchema),
  defeatConditions: z.array(defeatConditionSchema),
  mechanics: mechanicModifiersSchema,
  flavor: themeFlavorSchema,
});
