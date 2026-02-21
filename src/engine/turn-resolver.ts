// Turn resolution pipeline — orchestrates all 11 phases in order.
// Phase 2c: stubs replaced with real implementations; accepts resolvedAt param.

import type {
  GameState,
  GamePhase,
  PlayerOrders,
  PRNG,
  ResolutionLog,
  ResolutionPhase,
  TurnSummary,
  CivilizationState,
  CombatResultSummary,
  DiplomaticMessage,
  Hex,
  Unit,
  MuwardiInvasion,
} from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { fillMissingOrdersWithAI } from '@/engine/ai-governor';
import { resolveDiplomacy } from '@/engine/diplomacy';
import { resolveCombat } from '@/engine/combat';
import { resolveEconomy, getCustomTechEffectValue } from '@/engine/economy';
import { resolveEvents } from '@/engine/events';
import { getNeighbors } from '@/engine/map-generator';

export interface TurnResolutionResult {
  state: GameState;
  logs: ResolutionLog[];
}

// ---------------------------------------------------------------------------
// Helper — build a log entry
// ---------------------------------------------------------------------------

function logPhase(phase: ResolutionPhase, messages: string[]): ResolutionLog {
  return { phase, messages };
}

// ---------------------------------------------------------------------------
// Order validation (structural check only — real validation in each phase)
// ---------------------------------------------------------------------------

function validateOrders(
  state: GameState,
  _orders: PlayerOrders[],
  _theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  return {
    state,
    log: { phase: 'orders', messages: ['Orders validated'] },
  };
}

// ---------------------------------------------------------------------------
// Map helper — find a unit's location by id
// ---------------------------------------------------------------------------

function findUnitOnMap(
  map: Hex[][],
  unitId: string,
): { row: number; col: number; unitIndex: number; unit: Unit } | null {
  for (let r = 0; r < map.length; r++) {
    const mapRow = map[r];
    if (!mapRow) continue;
    for (let c = 0; c < mapRow.length; c++) {
      const hex = mapRow[c];
      if (!hex) continue;
      const idx = hex.units.findIndex((u) => u.id === unitId);
      if (idx !== -1) {
        return { row: r, col: c, unitIndex: idx, unit: hex.units[idx] };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function resolveMovement(
  state: GameState,
  orders: PlayerOrders[],
  _theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  // Shallow-copy the map so we can mutate hex references
  const newMap = state.map.map((row) =>
    row.map((hex) => ({ ...hex, units: [...hex.units] })),
  );

  for (const playerOrders of orders) {
    const civId = playerOrders.civilizationId;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'move') continue;
      const { unitId, path } = order;

      if (path.length === 0) {
        messages.push(`Unit ${unitId}: empty path, skipped`);
        continue;
      }

      const found = findUnitOnMap(newMap, unitId);
      if (!found) {
        messages.push(`Unit ${unitId}: not found on map, skipped`);
        continue;
      }

      const { row: srcRow, col: srcCol, unitIndex, unit } = found;

      if (unit.civilizationId !== civId) {
        messages.push(`Unit ${unitId}: owned by different civ, skipped`);
        continue;
      }

      if (path.length > unit.movesRemaining) {
        messages.push(`Unit ${unitId}: path length ${path.length} exceeds movesRemaining ${unit.movesRemaining}, skipped`);
        continue;
      }

      // Validate hex adjacency for each step (odd-r offset neighbors)
      const mapRows = newMap.length;
      const mapCols = mapRows > 0 ? (newMap[0]?.length ?? 0) : 0;
      let valid = true;
      let prev = newMap[srcRow][srcCol].coord;
      for (const step of path) {
        const neighbors = getNeighbors(prev, mapCols, mapRows);
        const isNeighbor = neighbors.some((n) => n.col === step.col && n.row === step.row);
        if (!isNeighbor) {
          messages.push(`Unit ${unitId}: non-adjacent step (${prev.col},${prev.row})→(${step.col},${step.row}), skipped`);
          valid = false;
          break;
        }
        prev = step;
      }
      if (!valid) continue;

      // Find destination hex
      const dest = path[path.length - 1];
      let destRow = -1;
      let destCol = -1;
      for (let r = 0; r < newMap.length && destRow === -1; r++) {
        const mapRow = newMap[r];
        if (!mapRow) continue;
        for (let c = 0; c < mapRow.length; c++) {
          if (mapRow[c].coord.col === dest.col && mapRow[c].coord.row === dest.row) {
            destRow = r;
            destCol = c;
            break;
          }
        }
      }

      if (destRow === -1) {
        messages.push(`Unit ${unitId}: destination (${dest.col},${dest.row}) not found, skipped`);
        continue;
      }

      // Max unit stack check
      const baseMaxStack = 6;
      const stackBonus = getCustomTechEffectValue(state, civId, 'max_unit_stack', _theme);
      const maxStack = baseMaxStack + stackBonus;
      const destUnits = newMap[destRow][destCol].units.filter((u) => u.civilizationId === civId);
      if (destUnits.length >= maxStack) {
        messages.push(`Unit ${unitId}: destination stack full (${destUnits.length}/${maxStack}), skipped`);
        continue;
      }

      const sourceCoord = { ...newMap[srcRow][srcCol].coord };

      // Remove from source
      const updatedUnit: Unit = { ...unit, movesRemaining: 0 };
      newMap[srcRow][srcCol] = {
        ...newMap[srcRow][srcCol],
        units: newMap[srcRow][srcCol].units.filter((_, i) => i !== unitIndex),
      };

      // Place at destination
      newMap[destRow][destCol] = {
        ...newMap[destRow][destCol],
        units: [...newMap[destRow][destCol].units, updatedUnit],
      };

      messages.push(
        `Unit ${unitId} moved from (${sourceCoord.col},${sourceCoord.row}) to (${dest.col},${dest.row})`,
      );
    }
  }

  return {
    state: { ...state, map: newMap },
    log: { phase: 'movement', messages: messages.length > 0 ? messages : ['Movement resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function resolveConstruction(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  let s = state;

  for (const playerOrders of orders) {
    const civId = playerOrders.civilizationId;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'construction') continue;
      const { settlementId, buildingDefinitionId } = order;

      const civ = s.civilizations[civId];
      if (!civ || civ.isEliminated) continue;

      const buildingDef = theme.buildings.find((b) => b.id === buildingDefinitionId);
      if (!buildingDef) {
        messages.push(`Building ${buildingDefinitionId}: unknown, skipped`);
        continue;
      }

      const allHexes = s.map.flat();
      const settlementHex = allHexes.find(
        (h) => h.settlement !== null && h.settlement.id === settlementId,
      );
      if (!settlementHex) {
        messages.push(`Settlement ${settlementId}: not found, skipped`);
        continue;
      }

      if (settlementHex.controlledBy !== civId) {
        messages.push(`Settlement ${settlementId}: not controlled by civ ${civId}, skipped`);
        continue;
      }

      if (
        buildingDef.prerequisiteTech !== null &&
        !civ.completedTechs.includes(buildingDef.prerequisiteTech)
      ) {
        messages.push(`Building ${buildingDefinitionId}: prereq tech ${buildingDef.prerequisiteTech} not completed, skipped`);
        continue;
      }

      const settlement = settlementHex.settlement!;
      const existingCount = settlement.buildings.filter((b) => b === buildingDefinitionId).length;
      if (existingCount >= buildingDef.maxPerSettlement) {
        messages.push(`Building ${buildingDefinitionId}: max per settlement (${buildingDef.maxPerSettlement}) reached, skipped`);
        continue;
      }

      // Civ ability: building cost reduction (e.g. "Libraries cost 10 dinars less to build")
      let costReduction = 0;
      const civDef = theme.civilizations.find((c) => c.id === civId);
      if (civDef) {
        for (const ability of civDef.specialAbilities) {
          const match = ability.match(/(\w[\w\s]*?) cost (\d+) dinars less/i);
          if (match) {
            const buildingNamePattern = match[1].toLowerCase();
            if (buildingDef.name.toLowerCase().includes(buildingNamePattern)) {
              costReduction += parseInt(match[2], 10);
            }
          }
        }
      }
      const effectiveCost = Math.max(0, buildingDef.cost - costReduction);

      const currentDinars = civ.resources['dinars'] ?? 0;
      if (currentDinars < effectiveCost) {
        messages.push(`Building ${buildingDefinitionId}: insufficient dinars (${currentDinars} < ${effectiveCost}), skipped`);
        continue;
      }

      // Apply: add building to settlement, deduct cost
      const newMap = s.map.map((row) =>
        row.map((hex) => {
          if (hex.settlement !== null && hex.settlement.id === settlementId) {
            return {
              ...hex,
              settlement: {
                ...hex.settlement,
                buildings: [...hex.settlement.buildings, buildingDefinitionId],
              },
            };
          }
          return hex;
        }),
      );

      s = {
        ...s,
        map: newMap,
        civilizations: {
          ...s.civilizations,
          [civId]: {
            ...s.civilizations[civId],
            resources: {
              ...civ.resources,
              dinars: currentDinars - effectiveCost,
            },
          },
        },
      };

      messages.push(`Civ ${civId} built ${buildingDefinitionId} in settlement ${settlementId}`);
    }
  }

  return {
    state: s,
    log: { phase: 'construction', messages: messages.length > 0 ? messages : ['Construction resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Recruitment
// ---------------------------------------------------------------------------

function resolveRecruitment(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  let s = state;
  const recruitedSettlements = new Set<string>(); // one recruit per settlement per turn

  for (const playerOrders of orders) {
    const civId = playerOrders.civilizationId;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'recruit') continue;
      const { settlementId, unitDefinitionId } = order;

      const civ = s.civilizations[civId];
      if (!civ || civ.isEliminated) continue;

      // One recruit per settlement per turn
      if (recruitedSettlements.has(settlementId)) {
        messages.push(`Settlement ${settlementId}: already recruited this turn, skipped`);
        continue;
      }

      const unitDef = theme.units.find((u) => u.id === unitDefinitionId);
      if (!unitDef) {
        messages.push(`Unit ${unitDefinitionId}: unknown, skipped`);
        continue;
      }

      // Check tech prerequisite
      if (unitDef.prerequisiteTech !== null && !civ.completedTechs.includes(unitDef.prerequisiteTech)) {
        messages.push(`Unit ${unitDefinitionId}: prereq tech ${unitDef.prerequisiteTech} not completed, skipped`);
        continue;
      }

      // Find settlement hex
      const allHexes = s.map.flat();
      const settlementHex = allHexes.find(
        (h) => h.settlement !== null && h.settlement.id === settlementId,
      );
      if (!settlementHex) {
        messages.push(`Settlement ${settlementId}: not found, skipped`);
        continue;
      }
      if (settlementHex.controlledBy !== civId) {
        messages.push(`Settlement ${settlementId}: not controlled by ${civId}, skipped`);
        continue;
      }

      // Check cost
      const currentDinars = civ.resources['dinars'] ?? 0;
      if (currentDinars < unitDef.cost) {
        messages.push(`Unit ${unitDefinitionId}: insufficient dinars (${currentDinars} < ${unitDef.cost}), skipped`);
        continue;
      }

      // Spawn unit
      const unitId = `unit-recruit-${civId}-t${s.turn}-${settlementId}`;
      const newUnit: Unit = {
        id: unitId,
        definitionId: unitDef.id,
        civilizationId: civId,
        strength: unitDef.strength,
        morale: unitDef.morale,
        movesRemaining: unitDef.moves,
        isGarrisoned: true,
      };

      // Place on settlement hex and deduct cost
      const newMap = s.map.map((row) =>
        row.map((hex) => {
          if (hex.settlement !== null && hex.settlement.id === settlementId) {
            return { ...hex, units: [...hex.units, newUnit] };
          }
          return hex;
        }),
      );

      s = {
        ...s,
        map: newMap,
        civilizations: {
          ...s.civilizations,
          [civId]: {
            ...civ,
            resources: {
              ...civ.resources,
              dinars: currentDinars - unitDef.cost,
            },
          },
        },
      };

      recruitedSettlements.add(settlementId);
      messages.push(`Civ ${civId} recruited ${unitDef.name} at ${settlementHex.settlement!.name} for ${unitDef.cost} dinars`);
    }
  }

  return {
    state: s,
    log: { phase: 'construction', messages: messages.length > 0 ? messages : ['Recruitment resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

function resolveResearch(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  let civs = { ...state.civilizations };

  for (const playerOrders of orders) {
    const civId = playerOrders.civilizationId;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'research') continue;
      const { techId, pointsAllocated } = order;

      const civ = civs[civId];
      if (!civ || civ.isEliminated) continue;

      const techDef = theme.techTree.find((t) => t.id === techId);
      if (!techDef) {
        messages.push(`Tech ${techId}: unknown, skipped`);
        continue;
      }

      if (civ.completedTechs.includes(techId)) {
        messages.push(`Tech ${techId}: already completed, skipped`);
        continue;
      }

      const missingPrereqs = techDef.prerequisites.filter(
        (p) => !civ.completedTechs.includes(p),
      );
      if (missingPrereqs.length > 0) {
        messages.push(`Tech ${techId}: missing prereqs [${missingPrereqs.join(', ')}], skipped`);
        continue;
      }

      const currentProgress = civ.techProgress[techId] ?? 0;
      const newProgress = currentProgress + pointsAllocated;

      let newCompletedTechs = [...civ.completedTechs];
      let newTechProgress: Record<string, number> = { ...civ.techProgress, [techId]: newProgress };

      if (newProgress >= techDef.cost) {
        // Tech completed — move to completedTechs, remove from progress
        newCompletedTechs = [...newCompletedTechs, techId];
        newTechProgress = Object.fromEntries(
          Object.entries(newTechProgress).filter(([k]) => k !== techId),
        );
        messages.push(`Civ ${civId} completed tech ${techId}`);
      } else {
        messages.push(`Civ ${civId}: tech ${techId} progress ${newProgress}/${techDef.cost}`);
      }

      civs = {
        ...civs,
        [civId]: {
          ...civ,
          techProgress: newTechProgress,
          completedTechs: newCompletedTechs,
        },
      };
    }
  }

  return {
    state: { ...state, civilizations: civs },
    log: { phase: 'research', messages: messages.length > 0 ? messages : ['Research resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Tension accumulation — adjusts religious_fervor based on turn actions
// ---------------------------------------------------------------------------

function resolveTension(
  state: GameState,
  theme: ThemePackage,
  diplomacyProposals: Array<{ source: string; target: string; actionType: string }>,
  newAlliancePairs: Array<[string, string]>,
  controlTransfers: Array<{ hexCoord: { col: number; row: number }; newOwner: string; previousOwner: string | null }>,
  constructedBuildings: Array<{ civId: string; buildingId: string }>,
  completedTechsCiv: Array<{ civId: string; techId: string }>,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  const hasTensionAxis = theme.mechanics.tensionAxes.some((a) => a.id === 'religious_fervor');
  if (!hasTensionAxis) return { state, log: logPhase('attrition', ['No tension axis defined']) };

  const civs = { ...state.civilizations };

  // Helper to get religion for a civ
  function getReligion(civId: string): string | undefined {
    return theme.civilizations.find((c) => c.id === civId)?.religion;
  }

  // Cross-religion war declaration: +10
  for (const proposal of diplomacyProposals) {
    if (proposal.actionType !== 'declare_war') continue;
    const srcRel = getReligion(proposal.source);
    const tgtRel = getReligion(proposal.target);
    if (srcRel && tgtRel && srcRel !== tgtRel) {
      for (const civId of [proposal.source, proposal.target]) {
        const civ = civs[civId];
        if (!civ || civ.isEliminated) continue;
        const current = civ.tensionAxes['religious_fervor'] ?? 0;
        civs[civId] = { ...civ, tensionAxes: { ...civ.tensionAxes, religious_fervor: Math.min(100, current + 10) } };
      }
      messages.push(`Cross-religion war: ${proposal.source} vs ${proposal.target}, religious_fervor +10`);
    }
  }

  // Same-religion alliance formed: -5
  for (const [civA, civB] of newAlliancePairs) {
    const relA = getReligion(civA);
    const relB = getReligion(civB);
    if (relA && relB && relA === relB) {
      for (const civId of [civA, civB]) {
        const civ = civs[civId];
        if (!civ || civ.isEliminated) continue;
        const current = civ.tensionAxes['religious_fervor'] ?? 0;
        civs[civId] = { ...civ, tensionAxes: { ...civ.tensionAxes, religious_fervor: Math.max(0, current - 5) } };
      }
      messages.push(`Same-religion alliance: ${civA} & ${civB}, religious_fervor -5`);
    }
  }

  // Conquered different-religion settlement: +8
  for (const transfer of controlTransfers) {
    if (!transfer.previousOwner) continue;
    const newRel = getReligion(transfer.newOwner);
    const prevRel = getReligion(transfer.previousOwner);
    if (newRel && prevRel && newRel !== prevRel) {
      const civ = civs[transfer.newOwner];
      if (civ && !civ.isEliminated) {
        const current = civ.tensionAxes['religious_fervor'] ?? 0;
        civs[transfer.newOwner] = { ...civ, tensionAxes: { ...civ.tensionAxes, religious_fervor: Math.min(100, current + 8) } };
        messages.push(`Cross-religion conquest by ${transfer.newOwner}, religious_fervor +8`);
      }
    }
  }

  // Religious building constructed: +3 own civ, +5 to neighbor civs of different religion
  const religiousBuildingPattern = /mosque|cathedral|synagogue/i;
  for (const { civId, buildingId } of constructedBuildings) {
    const buildingDef = theme.buildings.find((b) => b.id === buildingId);
    if (!buildingDef || !religiousBuildingPattern.test(buildingDef.name)) continue;

    const civ = civs[civId];
    if (!civ || civ.isEliminated) continue;
    const ownRel = getReligion(civId);
    const current = civ.tensionAxes['religious_fervor'] ?? 0;
    civs[civId] = { ...civ, tensionAxes: { ...civ.tensionAxes, religious_fervor: Math.min(100, current + 3) } };
    messages.push(`Religious building built by ${civId}, religious_fervor +3`);

    // +5 to neighbor civs of different religion
    for (const otherCivId of Object.keys(civs)) {
      if (otherCivId === civId) continue;
      const otherCiv = civs[otherCivId];
      if (!otherCiv || otherCiv.isEliminated) continue;
      const otherRel = getReligion(otherCivId);
      if (ownRel && otherRel && ownRel !== otherRel) {
        const otherCurrent = otherCiv.tensionAxes['religious_fervor'] ?? 0;
        civs[otherCivId] = { ...otherCiv, tensionAxes: { ...otherCiv.tensionAxes, religious_fervor: Math.min(100, otherCurrent + 5) } };
      }
    }
  }

  // Tolerant tech researched: -3 all civs
  for (const { techId } of completedTechsCiv) {
    const techDef = theme.techTree.find((t) => t.id === techId);
    if (!techDef) continue;
    const hasTensionReduction = techDef.effects.some(
      (e) => e.kind === 'custom' && e.key === 'tension_reduction',
    );
    if (hasTensionReduction) {
      for (const cId of Object.keys(civs)) {
        const c = civs[cId];
        if (!c || c.isEliminated) continue;
        const current = c.tensionAxes['religious_fervor'] ?? 0;
        civs[cId] = { ...c, tensionAxes: { ...c.tensionAxes, religious_fervor: Math.max(0, current - 3) } };
      }
      messages.push(`Tolerant tech ${techId} researched, all civs religious_fervor -3`);
    }
  }

  return {
    state: { ...state, civilizations: civs },
    log: logPhase('attrition', messages.length > 0 ? messages : ['Tension resolved']),
  };
}

// ---------------------------------------------------------------------------
// Muwardi invasion — spawns when Asharite civ has high tension for 2+ turns
// ---------------------------------------------------------------------------

function resolveMuwardiInvasion(
  state: GameState,
  theme: ThemePackage,
  prng: PRNG,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  let s = state;

  const muwardiCivDef = theme.civilizations.find((c) => c.id === 'muwardi');
  if (!muwardiCivDef) return { state: s, log: logPhase('attrition', ['No Muwardi civ defined']) };

  // Check if all Muwardi units are destroyed → deactivate invasion
  if (s.muwardiInvasion?.active) {
    const muwardiUnits = s.map.flat().flatMap((h) => h.units.filter((u) => u.civilizationId === 'muwardi'));
    if (muwardiUnits.length === 0) {
      messages.push('All Muwardi units destroyed — invasion ended');
      // Reduce tension for all civs
      const civs = { ...s.civilizations };
      for (const civId of Object.keys(civs)) {
        const civ = civs[civId];
        if (civ.isEliminated) continue;
        const current = civ.tensionAxes['religious_fervor'] ?? 0;
        civs[civId] = { ...civ, tensionAxes: { ...civ.tensionAxes, religious_fervor: Math.max(0, current - 20) } };
      }
      s = { ...s, civilizations: civs, muwardiInvasion: { active: false, spawnedOnTurn: s.muwardiInvasion.spawnedOnTurn } };

      // Neutralize any settlements captured by muwardi
      const newMap = s.map.map((row) =>
        row.map((hex) => hex.controlledBy === 'muwardi' ? { ...hex, controlledBy: null } : hex),
      );
      s = { ...s, map: newMap };
      return { state: s, log: logPhase('attrition', messages) };
    }
  }

  // Check spawn condition: Asharite civ with religious_fervor > 90 for 2+ turns
  if (!s.muwardiInvasion?.active) {
    const ashariteCivs = Object.keys(s.civilizations).filter((civId) => {
      const civDef = theme.civilizations.find((c) => c.id === civId);
      return civDef?.religion === 'asharite' && !s.civilizations[civId].isEliminated;
    });

    let shouldSpawn = false;
    for (const civId of ashariteCivs) {
      const civ = s.civilizations[civId];
      const fervor = civ.tensionAxes['religious_fervor'] ?? 0;
      if (fervor > 90) {
        // Track via muwardi_threat axis as consecutive counter
        const consecutive = (civ.tensionAxes['muwardi_threat'] ?? 0) + 1;
        const civs = { ...s.civilizations };
        civs[civId] = { ...civ, tensionAxes: { ...civ.tensionAxes, muwardi_threat: consecutive } };
        s = { ...s, civilizations: civs };
        if (consecutive >= 2) {
          shouldSpawn = true;
          messages.push(`${civId} religious_fervor >90 for ${consecutive} turns — Muwardi invasion triggered`);
        }
      }
    }

    if (shouldSpawn) {
      // Find southern edge hexes near Asharite territory
      const mapRows = s.map.length;
      const spawnRow = mapRows - 1;
      const spawnHexes = (s.map[spawnRow] ?? []).filter(
        (h) => h.terrain !== 'sea' && h.units.length === 0,
      );

      // Pick 1-2 spawn hexes
      const selectedHexes = spawnHexes.slice(0, Math.min(2, spawnHexes.length));
      if (selectedHexes.length === 0) {
        return { state: s, log: logPhase('attrition', ['Muwardi spawn: no valid hexes']) };
      }

      // Find Muwardi unit definitions
      const muwardiUnits = theme.units.filter((u) => {
        const civUniques = muwardiCivDef.uniqueUnits;
        return civUniques.includes(u.id) || u.id === 'muwardi-warrior' || u.id === 'muwardi-zealot';
      });
      const fallbackUnit = theme.units.find((u) => u.id === 'levy-spearman') ?? theme.units[0];
      const unitDef = muwardiUnits.length > 0 ? muwardiUnits[0] : fallbackUnit;

      if (!unitDef) return { state: s, log: logPhase('attrition', messages) };

      // Spawn 3-5 units spread across selected hexes
      const unitCount = prng.nextInt(3, 5);
      const newMap = s.map.map((row) => row.map((hex) => ({ ...hex, units: [...hex.units] })));

      for (let i = 0; i < unitCount; i++) {
        const targetHex = selectedHexes[i % selectedHexes.length];
        const r = targetHex.coord.row;
        const c = targetHex.coord.col;
        const newUnit: Unit = {
          id: `muwardi-unit-${s.turn}-${i}`,
          definitionId: unitDef.id,
          civilizationId: 'muwardi',
          strength: unitDef.strength,
          morale: unitDef.morale,
          movesRemaining: unitDef.moves,
          isGarrisoned: false,
        };
        if (newMap[r]?.[c]) {
          newMap[r][c] = { ...newMap[r][c], units: [...newMap[r][c].units, newUnit] };
        }
      }

      // Set Muwardi at war with all non-eliminated civs
      const civs = { ...s.civilizations };
      // Create muwardi civ state if not exists
      if (!civs['muwardi']) {
        const warRelations: Record<string, import('@/engine/types').RelationshipState> = {};
        for (const civId of Object.keys(civs)) {
          warRelations[civId] = 'war';
        }
        civs['muwardi'] = {
          id: 'muwardi',
          playerId: null,
          resources: {},
          techProgress: {},
          completedTechs: [],
          culturalInfluence: 0,
          stability: 100,
          diplomaticRelations: warRelations,
          tensionAxes: {},
          isEliminated: false,
          turnsMissingOrders: 0,
          turnsAtZeroStability: 0,
        };
      }
      // Set all civs at war with muwardi
      for (const civId of Object.keys(civs)) {
        if (civId === 'muwardi') continue;
        const civ = civs[civId];
        civs[civId] = {
          ...civ,
          diplomaticRelations: { ...civ.diplomaticRelations, muwardi: 'war' },
        };
      }

      s = {
        ...s,
        map: newMap,
        civilizations: civs,
        muwardiInvasion: { active: true, spawnedOnTurn: s.turn },
      };
      messages.push(`Muwardi invasion spawned ${unitCount} units on the southern coast`);
    }
  }

  return { state: s, log: logPhase('attrition', messages.length > 0 ? messages : ['Muwardi check resolved']) };
}

// ---------------------------------------------------------------------------
// Attrition & Stability
// ---------------------------------------------------------------------------

function resolveAttrition(
  state: GameState,
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  const hasGrainResource = theme.resources.some((r) => r.id === 'grain');
  const hasTensionAxis = theme.mechanics.tensionAxes.some((a) => a.id === 'religious_fervor');
  const updatedCivs: Record<string, CivilizationState> = {};

  for (const civId of Object.keys(state.civilizations)) {
    const civ = state.civilizations[civId];
    if (civ.isEliminated) {
      updatedCivs[civId] = civ;
      continue;
    }

    let stabilityChange = 0;
    let cultureBonus = 0;

    // Grain attrition: only if grain resource exists in theme and civ has none
    if (hasGrainResource && (civ.resources['grain'] ?? 0) <= 0) {
      stabilityChange -= 10;
      messages.push(`Civ ${civId}: grain shortage, stability -10`);
    }

    // War attrition: -2 stability if at war with anyone
    if (Object.values(civ.diplomaticRelations).includes('war')) {
      stabilityChange -= 2;
      messages.push(`Civ ${civId}: war attrition, stability -2`);
    }

    // Tension-based attrition
    if (hasTensionAxis) {
      const fervor = civ.tensionAxes['religious_fervor'] ?? 0;
      if (fervor > 70) {
        stabilityChange -= 2;
        messages.push(`Civ ${civId}: high religious tension (${fervor}), stability -2`);
      }
      if (fervor < 30) {
        stabilityChange += 1;
        cultureBonus = 2;
        messages.push(`Civ ${civId}: low religious tension (${fervor}), stability +1, culture +2`);
      }
    }

    const newStability = Math.max(0, Math.min(100, civ.stability + stabilityChange));
    const newResources = cultureBonus > 0
      ? { ...civ.resources, faith: (civ.resources['faith'] ?? 0) + cultureBonus }
      : civ.resources;
    updatedCivs[civId] = { ...civ, stability: newStability, resources: newResources };
  }

  return {
    state: { ...state, civilizations: updatedCivs },
    log: {
      phase: 'attrition',
      messages: messages.length > 0 ? messages : ['Attrition resolved'],
    },
  };
}

// ---------------------------------------------------------------------------
// Victory / Defeat
// ---------------------------------------------------------------------------

function checkVictoryDefeat(
  state: GameState,
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  const allHexes = state.map.flat();
  let updatedCivs = { ...state.civilizations };
  let gamePhase: GamePhase = state.phase;

  // Check defeat conditions for each non-eliminated civ
  for (const civId of Object.keys(updatedCivs)) {
    const civ = updatedCivs[civId];
    if (civ.isEliminated) continue;

    let eliminated = false;

    for (const condition of theme.defeatConditions) {
      if (eliminated) break;
      switch (condition.kind) {
        case 'capital_lost': {
          const hasCapital = allHexes.some(
            (h) => h.controlledBy === civId && h.settlement?.isCapital === true,
          );
          if (!hasCapital) {
            eliminated = true;
            messages.push(`Civ ${civId}: capital lost, eliminated`);
          }
          break;
        }
        case 'stability_zero': {
          if (civ.stability === 0) {
            const newCount = (civ.turnsAtZeroStability ?? 0) + 1;
            const threshold = condition.turnsAtZero ?? 1;
            if (newCount >= threshold) {
              eliminated = true;
              messages.push(`Civ ${civId}: stability at zero for ${newCount} turn(s), eliminated`);
            } else {
              messages.push(`Civ ${civId}: stability at zero (${newCount}/${threshold} turns)`);
              // Update the counter without eliminating
              updatedCivs = {
                ...updatedCivs,
                [civId]: { ...updatedCivs[civId], turnsAtZeroStability: newCount },
              };
            }
          } else if ((civ.turnsAtZeroStability ?? 0) > 0) {
            // Stability recovered — reset counter
            updatedCivs = {
              ...updatedCivs,
              [civId]: { ...updatedCivs[civId], turnsAtZeroStability: 0 },
            };
            messages.push(`Civ ${civId}: stability recovered, zero-stability counter reset`);
          }
          break;
        }
        case 'eliminated_by_combat': {
          const hasUnits = allHexes.some((h) =>
            h.units.some((u) => u.civilizationId === civId),
          );
          const hasSettlements = allHexes.some(
            (h) => h.controlledBy === civId && h.settlement !== null,
          );
          if (!hasUnits && !hasSettlements) {
            eliminated = true;
            messages.push(`Civ ${civId}: no units or settlements, eliminated by combat`);
          }
          break;
        }
        case 'custom':
          break;
      }
    }

    if (eliminated) {
      updatedCivs = {
        ...updatedCivs,
        [civId]: { ...civ, isEliminated: true },
      };
    }
  }

  // Check victory conditions for surviving civs
  const survivingCivIds = Object.keys(updatedCivs).filter(
    (id) => !updatedCivs[id].isEliminated,
  );

  for (const civId of survivingCivIds) {
    if (gamePhase === 'completed') break;
    const civ = updatedCivs[civId];

    for (const condition of theme.victoryConditions) {
      if (gamePhase === 'completed') break;
      switch (condition.kind) {
        case 'eliminate_all': {
          if (survivingCivIds.length === 1 && survivingCivIds[0] === civId) {
            gamePhase = 'completed';
            messages.push(`Civ ${civId}: all others eliminated, victory`);
          }
          break;
        }
        case 'control_hexes': {
          const controlledCount = allHexes.filter((h) => h.controlledBy === civId).length;
          if (controlledCount >= condition.count) {
            gamePhase = 'completed';
            messages.push(`Civ ${civId}: controls ${controlledCount} hexes (>= ${condition.count}), victory`);
          }
          break;
        }
        case 'resource_accumulate': {
          if ((civ.resources[condition.resourceId] ?? 0) >= condition.amount) {
            gamePhase = 'completed';
            messages.push(`Civ ${civId}: accumulated ${condition.amount} ${condition.resourceId}, victory`);
          }
          break;
        }
        case 'tech_advance': {
          if (civ.completedTechs.includes(condition.techId)) {
            gamePhase = 'completed';
            messages.push(`Civ ${civId}: tech advance ${condition.techId}, victory`);
          }
          break;
        }
        case 'survive_turns': {
          if (state.turn >= condition.turns && (gamePhase as string) !== 'completed') {
            gamePhase = 'completed';
            // All surviving civs share the victory
            const winners = survivingCivIds.join(', ');
            messages.push(`Turn ${condition.turns} reached — surviving civilizations share victory: ${winners}`);
          }
          break;
        }
        case 'custom':
          break;
      }
    }
  }

  return {
    state: { ...state, civilizations: updatedCivs, phase: gamePhase },
    log: {
      phase: 'victory_defeat',
      messages: messages.length > 0 ? messages : ['Victory/defeat checked'],
    },
  };
}

// ---------------------------------------------------------------------------
// Healing — units on friendly hexes with settlements heal each turn
// ---------------------------------------------------------------------------

function resolveHealing(
  state: GameState,
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  // Pre-compute unit_heal_rate bonus per civ
  const healRateByCiv = new Map<string, number>();
  for (const civId of Object.keys(state.civilizations)) {
    const bonus = getCustomTechEffectValue(state, civId, 'unit_heal_rate', theme);
    if (bonus !== 0) healRateByCiv.set(civId, bonus);
  }

  const newMap = state.map.map((row) =>
    row.map((hex) => {
      if (hex.units.length === 0) return hex;
      if (!hex.settlement || hex.controlledBy === null) return hex;

      const healedUnits = hex.units.map((unit) => {
        // Only heal units on a friendly settlement hex
        if (unit.civilizationId !== hex.controlledBy) return unit;

        const unitDef = theme.units.find((u) => u.id === unit.definitionId);
        if (!unitDef) return unit;

        const maxStrength = unitDef.strength;
        if (unit.strength >= maxStrength) return unit;

        const baseHeal = 1;
        const techHealBonus = healRateByCiv.get(unit.civilizationId) ?? 0;
        const newStrength = Math.min(maxStrength, unit.strength + baseHeal + techHealBonus);
        messages.push(
          `Unit ${unit.id} healed +${baseHeal + techHealBonus} strength at ${hex.settlement!.name} (${newStrength}/${maxStrength})`,
        );
        return { ...unit, strength: newStrength };
      });

      return { ...hex, units: healedUnits };
    }),
  );

  return {
    state: { ...state, map: newMap },
    log: { phase: 'economy' as ResolutionPhase, messages: messages.length > 0 ? messages : ['Healing resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Control transfer — after combat, sole occupant claims the hex
// ---------------------------------------------------------------------------

function resolveControlTransfer(state: GameState): GameState {
  const newMap = state.map.map((row) =>
    row.map((hex) => {
      if (hex.units.length === 0) return hex;
      const civIds = [...new Set(hex.units.map((u) => u.civilizationId))];
      if (civIds.length !== 1) return hex; // contested — no transfer
      const sole = civIds[0]!;
      if (sole === hex.controlledBy) return hex; // already controlled
      return { ...hex, controlledBy: sole };
    }),
  );
  return { ...state, map: newMap };
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

function generateSummary(
  state: GameState,
  _theme: ThemePackage,
  resolvedAt: string,
  resourcesBefore: Record<string, Record<string, number>>,
  completedTechsBefore: Record<string, string[]>,
  combatResults: CombatResultSummary[],
  movementMessages: string[],
  diplomaticMessages: DiplomaticMessage[],
): { state: GameState; log: ResolutionLog; summary: TurnSummary } {
  const summary: TurnSummary = {
    turnNumber: state.turn,
    resolvedAt,
    entries: Object.keys(state.civilizations).map((civId) => {
      const civ = state.civilizations[civId];
      const before = resourcesBefore[civId] ?? {};
      const techsBefore = completedTechsBefore[civId] ?? [];

      // Resource deltas
      const resourceDeltas: Record<string, number> = {};
      const allResourceIds = new Set([
        ...Object.keys(before),
        ...Object.keys(civ.resources),
      ]);
      for (const resId of allResourceIds) {
        const delta = (civ.resources[resId] ?? 0) - (before[resId] ?? 0);
        if (delta !== 0) resourceDeltas[resId] = delta;
      }

      // Tech completed this turn
      const newTechs = civ.completedTechs.filter((t) => !techsBefore.includes(t));
      const techCompleted = newTechs.length > 0 ? (newTechs[0] ?? null) : null;

      // Combat results involving this civ
      const civCombatResults = combatResults.filter(
        (r) => r.attackerCivId === civId || r.defenderCivId === civId,
      );

      // Events activated this turn for this civ
      const eventsActivated = state.activeEvents
        .filter(
          (e) =>
            e.targetCivilizationIds.includes(civId) &&
            e.activatedOnTurn === state.turn,
        )
        .map((e) => e.definitionId);

      // Narrative lines
      const narrativeLines: string[] = [];

      // Movement messages for this civ
      for (const msg of movementMessages) {
        if (msg.includes(civId) || msg.includes(`unit-start-${civId}`) || msg.includes(`unit-recruit-${civId}`)) {
          narrativeLines.push(msg);
        }
      }

      // Diplomatic messages received by this civ
      for (const dm of diplomaticMessages) {
        if (dm.toCivId === civId) {
          narrativeLines.push(`Message from ${dm.fromCivId}: ${dm.message}`);
        }
      }

      for (const [resId, delta] of Object.entries(resourceDeltas)) {
        narrativeLines.push(`${resId}: ${delta > 0 ? '+' : ''}${delta}`);
      }
      if (techCompleted) {
        narrativeLines.push(`Research complete: ${techCompleted}`);
      }
      for (const combat of civCombatResults) {
        const role = combat.attackerCivId === civId ? 'attacker' : 'defender';
        narrativeLines.push(
          `Combat at (${combat.coord.col},${combat.coord.row}): ${combat.outcome} (as ${role})`,
        );
      }
      if (narrativeLines.length === 0) {
        narrativeLines.push(`Turn ${state.turn} complete.`);
      }

      return {
        civId,
        narrativeLines,
        resourceDeltas,
        eventsActivated,
        combatResults: civCombatResults,
        techCompleted,
        eliminated: civ.isEliminated,
      };
    }),
  };

  return {
    state,
    log: { phase: 'summary', messages: ['Summary generated'] },
    summary,
  };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export function resolveTurn(
  state: GameState,
  submittedOrders: PlayerOrders[],
  theme: ThemePackage,
  prng: PRNG,
  resolvedAt: string,
): TurnResolutionResult {
  const logs: ResolutionLog[] = [];
  let s = state;

  // Reset movesRemaining for all units at the start of each turn
  // Apply movement_range_bonus from custom tech effects
  const unitMovesLookup = new Map(theme.units.map((u) => [u.id, u.moves]));
  const moveBonusByCiv = new Map<string, number>();
  for (const civId of Object.keys(s.civilizations)) {
    const bonus = getCustomTechEffectValue(s, civId, 'movement_range_bonus', theme);
    if (bonus !== 0) moveBonusByCiv.set(civId, bonus);
  }
  const resetMap = state.map.map((row) =>
    row.map((hex) => ({
      ...hex,
      units: hex.units.map((unit) => {
        const baseMoves = unitMovesLookup.get(unit.definitionId) ?? unit.movesRemaining;
        const bonus = moveBonusByCiv.get(unit.civilizationId) ?? 0;
        return { ...unit, movesRemaining: baseMoves + bonus };
      }),
    })),
  );
  s = { ...s, map: resetMap };

  // Snapshot resources and completedTechs before any phase (for delta calculation)
  const resourcesBefore: Record<string, Record<string, number>> = {};
  const completedTechsBefore: Record<string, string[]> = {};
  for (const [civId, civ] of Object.entries(s.civilizations)) {
    resourcesBefore[civId] = { ...civ.resources };
    completedTechsBefore[civId] = [...civ.completedTechs];
  }

  // Fill missing orders with AI (pass resolvedAt instead of new Date())
  const allOrders = fillMissingOrdersWithAI(s, submittedOrders, theme, prng.fork(), resolvedAt);
  logs.push(
    logPhase('orders', [
      `AI filled orders for ${allOrders.length - submittedOrders.length} civilization(s)`,
    ]),
  );

  // Diplomacy
  const diplomacyResult = resolveDiplomacy(s, allOrders, theme);
  s = diplomacyResult.state;
  const diplomaticMessages = diplomacyResult.diplomaticMessages;
  logs.push(logPhase('diplomacy', ['Diplomacy resolved']));

  // Validate orders
  const validationResult = validateOrders(s, allOrders, theme);
  s = validationResult.state;
  logs.push(validationResult.log);

  // Movement
  const movementResult = resolveMovement(s, allOrders, theme);
  s = movementResult.state;
  logs.push(movementResult.log);

  // Split stack processing (before movement)
  for (const playerOrders of allOrders) {
    for (const order of playerOrders.orders) {
      if (order.kind !== 'split_stack') continue;
      const { hexCoord, unitIds, destinationCoord } = order;
      const mapRows = s.map.length;
      const mapCols = mapRows > 0 ? (s.map[0]?.length ?? 0) : 0;

      // Validate destination is adjacent
      const neighbors = getNeighbors(hexCoord, mapCols, mapRows);
      const isAdjacent = neighbors.some((n) => n.col === destinationCoord.col && n.row === destinationCoord.row);
      if (!isAdjacent) continue;

      const sourceHex = s.map[hexCoord.row]?.[hexCoord.col];
      const destHex = s.map[destinationCoord.row]?.[destinationCoord.col];
      if (!sourceHex || !destHex) continue;

      const unitsToMove = sourceHex.units.filter((u) => unitIds.includes(u.id));
      if (unitsToMove.length === 0) continue;

      const newMap = s.map.map((row) => row.map((hex) => ({ ...hex, units: [...hex.units] })));
      newMap[hexCoord.row][hexCoord.col] = {
        ...newMap[hexCoord.row][hexCoord.col],
        units: newMap[hexCoord.row][hexCoord.col].units.filter((u) => !unitIds.includes(u.id)),
      };
      newMap[destinationCoord.row][destinationCoord.col] = {
        ...newMap[destinationCoord.row][destinationCoord.col],
        units: [...newMap[destinationCoord.row][destinationCoord.col].units, ...unitsToMove],
      };
      s = { ...s, map: newMap };
    }
  }

  // Combat
  const { state: stateAfterCombat, combatResults } = resolveCombat(s, theme, prng.fork());
  s = stateAfterCombat;
  logs.push(logPhase('combat', ['Combat resolved']));

  // Control transfer — sole occupant claims the hex; track transfers for tension
  const controlBefore: Record<string, string | null> = {};
  for (const row of s.map) {
    for (const hex of row) {
      controlBefore[`${hex.coord.col},${hex.coord.row}`] = hex.controlledBy;
    }
  }
  s = resolveControlTransfer(s);
  const controlTransfers: Array<{ hexCoord: { col: number; row: number }; newOwner: string; previousOwner: string | null }> = [];
  for (const row of s.map) {
    for (const hex of row) {
      const key = `${hex.coord.col},${hex.coord.row}`;
      const prev = controlBefore[key] ?? null;
      if (hex.controlledBy && hex.controlledBy !== prev && hex.settlement) {
        controlTransfers.push({ hexCoord: hex.coord, newOwner: hex.controlledBy, previousOwner: prev });
      }
    }
  }

  // Economy
  s = resolveEconomy(s, theme);
  logs.push(logPhase('economy', ['Economy resolved']));

  // Cultural victory progress — add tech effect value to faith per turn
  for (const civId of Object.keys(s.civilizations)) {
    const cvp = getCustomTechEffectValue(s, civId, 'cultural_victory_progress', theme);
    if (cvp > 0) {
      const civ = s.civilizations[civId];
      s = {
        ...s,
        civilizations: {
          ...s.civilizations,
          [civId]: { ...civ, resources: { ...civ.resources, faith: (civ.resources['faith'] ?? 0) + cvp } },
        },
      };
    }
  }

  // Healing (units at friendly settlements recover strength)
  const healingResult = resolveHealing(s, theme);
  s = healingResult.state;
  logs.push(healingResult.log);

  // Construction
  const constructionResult = resolveConstruction(s, allOrders, theme);
  s = constructionResult.state;
  logs.push(constructionResult.log);

  // Recruitment
  const recruitmentResult = resolveRecruitment(s, allOrders, theme);
  s = recruitmentResult.state;
  logs.push(recruitmentResult.log);

  // Research
  const researchResult = resolveResearch(s, allOrders, theme);
  s = researchResult.state;
  logs.push(researchResult.log);

  // Trigger events from tech completions (trigger_event custom effect)
  for (const [civId, civ] of Object.entries(s.civilizations)) {
    const before = completedTechsBefore[civId] ?? [];
    for (const techId of civ.completedTechs) {
      if (before.includes(techId)) continue;
      const techDef = theme.techTree.find((t) => t.id === techId);
      if (!techDef) continue;
      for (const effect of techDef.effects) {
        if (effect.kind === 'custom' && effect.key === 'trigger_event' && typeof effect.value === 'string') {
          const eventDef = theme.events.find((e) => e.id === effect.value);
          if (eventDef) {
            const instanceId = `${eventDef.id}-trigger-${civId}-${s.turn}`;
            const alreadyActive = s.activeEvents.some((e) => e.instanceId === instanceId);
            if (!alreadyActive) {
              const targetCivIds = eventDef.targetCivs === 'all'
                ? Object.keys(s.civilizations).filter((id) => !s.civilizations[id].isEliminated)
                : eventDef.targetCivs === 'random_one'
                ? [civId]
                : (eventDef.targetCivs as string[]);
              s = {
                ...s,
                activeEvents: [
                  ...s.activeEvents,
                  {
                    instanceId,
                    definitionId: eventDef.id,
                    targetCivilizationIds: targetCivIds,
                    activatedOnTurn: s.turn,
                    expiresOnTurn: null,
                    responses: {},
                    resolved: false,
                  },
                ],
              };
            }
          }
        }
      }
    }
  }

  // Events (pass allOrders so event responses can be processed)
  s = resolveEvents(s, allOrders, theme, prng.fork());
  logs.push(logPhase('events', ['Events resolved']));

  // Tension accumulation
  const diplomacyProposals: Array<{ source: string; target: string; actionType: string }> = [];
  for (const po of allOrders) {
    for (const order of po.orders) {
      if (order.kind === 'diplomatic') {
        diplomacyProposals.push({ source: po.civilizationId, target: order.targetCivId, actionType: order.actionType });
      }
    }
  }
  // Detect new alliances formed this turn
  const newAlliancePairs: Array<[string, string]> = [];
  for (const civId of Object.keys(s.civilizations)) {
    const rels = s.civilizations[civId].diplomaticRelations;
    const before = resourcesBefore[civId] ? state.civilizations[civId]?.diplomaticRelations : {};
    for (const [otherId, rel] of Object.entries(rels)) {
      if (rel === 'alliance' && before && before[otherId] !== 'alliance' && civId < otherId) {
        newAlliancePairs.push([civId, otherId]);
      }
    }
  }
  // Track constructed buildings
  const constructedBuildings: Array<{ civId: string; buildingId: string }> = [];
  for (const po of allOrders) {
    for (const order of po.orders) {
      if (order.kind === 'construction') {
        constructedBuildings.push({ civId: po.civilizationId, buildingId: order.buildingDefinitionId });
      }
    }
  }
  // Track newly completed techs
  const completedTechsThisTurn: Array<{ civId: string; techId: string }> = [];
  for (const [civId, civ] of Object.entries(s.civilizations)) {
    const before = completedTechsBefore[civId] ?? [];
    for (const techId of civ.completedTechs) {
      if (!before.includes(techId)) {
        completedTechsThisTurn.push({ civId, techId });
      }
    }
  }

  const tensionResult = resolveTension(s, theme, diplomacyProposals, newAlliancePairs, controlTransfers, constructedBuildings, completedTechsThisTurn);
  s = tensionResult.state;
  logs.push(tensionResult.log);

  // Muwardi invasion check
  const muwardiResult = resolveMuwardiInvasion(s, theme, prng.fork());
  s = muwardiResult.state;
  logs.push(muwardiResult.log);

  // Attrition & Stability
  const attritionResult = resolveAttrition(s, theme);
  s = attritionResult.state;
  logs.push(attritionResult.log);

  // Victory/Defeat
  const victoryResult = checkVictoryDefeat(s, theme);
  s = victoryResult.state;
  logs.push(victoryResult.log);

  // Summary (with real resource deltas, tech completion, combat results, movement, and messages)
  const summaryResult = generateSummary(
    s,
    theme,
    resolvedAt,
    resourcesBefore,
    completedTechsBefore,
    combatResults,
    movementResult.log.messages,
    diplomaticMessages,
  );
  s = summaryResult.state;
  logs.push(summaryResult.log);

  // Advance turn counter and persist RNG state
  const resolved: GameState = {
    ...s,
    turn: s.turn + 1,
    rngState: prng.state,
    lastResolvedAt: resolvedAt,
    turnHistory: [...s.turnHistory, summaryResult.summary],
  };

  return { state: resolved, logs };
}
