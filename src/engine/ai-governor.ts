// AI governor — generates orders for civs without a human player or who missed
// their turn deadline. Includes movement, expansion, combat, event response,
// and personality-driven priority ordering.
// Pure function: no side effects, no async. Accepts submittedAt as a parameter
// instead of calling new Date() internally.

import type { GameState, PlayerOrders, PRNG, AnyOrder, Hex, HexCoord, Unit } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { getNeighbors } from '@/engine/map-generator';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface LocatedUnit {
  unit: Unit;
  coord: HexCoord;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function getOwnedUnits(state: GameState, civId: string): LocatedUnit[] {
  const result: LocatedUnit[] = [];
  for (const row of state.map) {
    for (const hex of row) {
      for (const unit of hex.units) {
        if (unit.civilizationId === civId) {
          result.push({ unit, coord: hex.coord });
        }
      }
    }
  }
  return result;
}

function getControlledSettlements(state: GameState, civId: string): Hex[] {
  return state.map.flat().filter(
    (h) => h.controlledBy === civId && h.settlement !== null,
  );
}

function getUnclaimedSettlements(state: GameState): Hex[] {
  return state.map.flat().filter(
    (h) => h.settlement !== null && h.controlledBy === null,
  );
}

function getEnemyCivIds(state: GameState, civId: string): string[] {
  const civ = state.civilizations[civId];
  if (!civ) return [];
  return Object.entries(civ.diplomaticRelations)
    .filter(([, rel]) => rel === 'war')
    .map(([id]) => id);
}

/**
 * BFS from `from` toward the nearest coord in `targets`.
 * Returns a multi-step path (up to `maxSteps` steps) along the shortest
 * route, or null if no path exists. Sea hexes are impassable.
 */
function findPathToward(
  map: Hex[][],
  from: HexCoord,
  targets: Set<string>,
  maxSteps: number,
): HexCoord[] | null {
  if (targets.size === 0 || maxSteps <= 0) return null;

  const rows = map.length;
  const cols = rows > 0 ? (map[0]?.length ?? 0) : 0;

  // Build hex lookup
  const hexLookup = new Map<string, Hex>();
  for (const row of map) {
    for (const hex of row) {
      hexLookup.set(`${hex.coord.col},${hex.coord.row}`, hex);
    }
  }

  const fromKey = `${from.col},${from.row}`;
  if (targets.has(fromKey)) return null; // already there

  // BFS — track parent to reconstruct full path
  const visited = new Set<string>([fromKey]);
  const parent = new Map<string, string>(); // childKey → parentKey
  const queue: HexCoord[] = [from];
  let targetKey: string | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.col},${current.row}`;
    const neighbors = getNeighbors(current, cols, rows);

    for (const neighbor of neighbors) {
      const nKey = `${neighbor.col},${neighbor.row}`;
      if (visited.has(nKey)) continue;
      visited.add(nKey);

      const hex = hexLookup.get(nKey);
      if (!hex || hex.terrain === 'sea') continue;

      parent.set(nKey, currentKey);

      if (targets.has(nKey)) {
        targetKey = nKey;
        break;
      }

      queue.push(neighbor);
    }
    if (targetKey) break;
  }

  if (!targetKey) return null; // no reachable target

  // Reconstruct full path from `from` to target
  const fullPath: HexCoord[] = [];
  let stepKey = targetKey;
  while (stepKey !== fromKey) {
    const [sc, sr] = stepKey.split(',').map(Number);
    fullPath.unshift({ col: sc, row: sr });
    stepKey = parent.get(stepKey)!;
  }

  // Return up to maxSteps of the path
  return fullPath.slice(0, maxSteps);
}

/**
 * Convenience wrapper: returns just the first step toward targets.
 */
function findFirstStepToward(
  map: Hex[][],
  from: HexCoord,
  targets: Set<string>,
): HexCoord | null {
  const path = findPathToward(map, from, targets, 1);
  return path && path.length > 0 ? path[0] : null;
}

// ---------------------------------------------------------------------------
// Personality classification
// ---------------------------------------------------------------------------

type AIPersonality = 'military' | 'diplomatic' | 'merchant' | 'pacifist';

function classifyPersonality(specialAbilities: string[]): AIPersonality {
  const joined = specialAbilities.join(' ').toLowerCase();
  if (joined.includes('diaspora') || joined.includes('kindath')) return 'pacifist';
  if (joined.includes('aggressive') || joined.includes('sword') || joined.includes('reconquista')) return 'military';
  if (joined.includes('merchant') || joined.includes('trade') || joined.includes('sea trader')) return 'merchant';
  if (joined.includes('patron') || joined.includes('scholar') || joined.includes('cultural')) return 'diplomatic';
  return 'diplomatic'; // default
}

// ---------------------------------------------------------------------------
// Heuristic order generation
// ---------------------------------------------------------------------------

export function generateAIOrders(
  state: GameState,
  civId: string,
  theme: ThemePackage,
  prng: PRNG,
  submittedAt: string,
): PlayerOrders {
  void prng; // reserved for future stochastic heuristics

  const civ = state.civilizations[civId];
  const orders: AnyOrder[] = [];

  if (!civ || civ.isEliminated) {
    return {
      playerId: `ai_${civId}`,
      civilizationId: civId,
      turnNumber: state.turn,
      orders: [],
      submittedAt,
    };
  }

  // Muwardi AI: simple aggressive behavior — move all units toward nearest settlement, attack on contact
  if (civId === 'muwardi') {
    const ownedUnits = getOwnedUnits(state, civId);
    // Find all non-muwardi settlements
    const targetSettlements = state.map.flat().filter(
      (h) => h.settlement !== null && h.controlledBy !== 'muwardi',
    );
    const targets = new Set(targetSettlements.map((h) => `${h.coord.col},${h.coord.row}`));

    for (const lu of ownedUnits) {
      if (lu.unit.movesRemaining <= 0) continue;
      const path = findPathToward(state.map, lu.coord, targets, lu.unit.movesRemaining);
      if (path && path.length > 0) {
        orders.push({ kind: 'move', unitId: lu.unit.id, path });
      }
    }

    return {
      playerId: 'ai_muwardi',
      civilizationId: civId,
      turnNumber: state.turn,
      orders,
      submittedAt,
    };
  }

  const civDef = theme.civilizations.find((c) => c.id === civId);
  const personality = classifyPersonality(civDef?.specialAbilities ?? []);
  const ownedUnits = getOwnedUnits(state, civId);
  const controlledSettlements = getControlledSettlements(state, civId);
  const unclaimedSettlements = getUnclaimedSettlements(state);
  const enemyCivIds = getEnemyCivIds(state, civId);
  const movedUnitIds = new Set<string>();

  // Find capital hex
  const capitalHex = controlledSettlements.find(
    (h) => h.settlement?.isCapital === true,
  );

  // --- Heuristic: Garrison capital ---
  function garrisonCapital(): void {
    if (!capitalHex) return;
    const capitalKey = `${capitalHex.coord.col},${capitalHex.coord.row}`;
    const hasGarrison = capitalHex.units.some(
      (u) => u.civilizationId === civId,
    );
    if (hasGarrison) return;

    // Find nearest idle unit and move toward capital
    const idleUnits = ownedUnits.filter(
      (lu) => !movedUnitIds.has(lu.unit.id) && lu.unit.movesRemaining > 0,
    );
    if (idleUnits.length === 0) return;

    const targets = new Set([capitalKey]);
    for (const lu of idleUnits) {
      const path = findPathToward(state.map, lu.coord, targets, lu.unit.movesRemaining);
      if (path && path.length > 0) {
        orders.push({ kind: 'move', unitId: lu.unit.id, path });
        movedUnitIds.add(lu.unit.id);
        return; // only need one unit
      }
    }
  }

  // --- Heuristic: Expand toward unclaimed settlements ---
  function expandToUnclaimed(): void {
    if (unclaimedSettlements.length === 0) return;

    const targets = new Set(
      unclaimedSettlements.map((h) => `${h.coord.col},${h.coord.row}`),
    );

    const idleUnits = ownedUnits.filter(
      (lu) => !movedUnitIds.has(lu.unit.id) && lu.unit.movesRemaining > 0,
    );

    // Personality controls how many units to send
    const maxUnits = personality === 'military' ? idleUnits.length
      : personality === 'pacifist' ? 0
      : personality === 'merchant' ? Math.min(2, idleUnits.length)
      : 1; // diplomatic

    let sent = 0;
    for (const lu of idleUnits) {
      if (sent >= maxUnits) break;
      const path = findPathToward(state.map, lu.coord, targets, lu.unit.movesRemaining);
      if (path && path.length > 0) {
        orders.push({ kind: 'move', unitId: lu.unit.id, path });
        movedUnitIds.add(lu.unit.id);
        sent++;
      }
    }
  }

  // --- Heuristic: Attack enemies at war (with force concentration) ---
  function attackEnemies(): void {
    if (enemyCivIds.length === 0) return;
    if (personality === 'pacifist') return;
    if (personality === 'diplomatic' && civ.stability <= 60) return;

    // Find enemy unit/settlement positions as candidate targets
    const enemyTargets: HexCoord[] = [];
    for (const row of state.map) {
      for (const hex of row) {
        if (hex.units.some((u) => enemyCivIds.includes(u.civilizationId))) {
          enemyTargets.push(hex.coord);
        } else if (hex.controlledBy && enemyCivIds.includes(hex.controlledBy) && hex.settlement) {
          enemyTargets.push(hex.coord);
        }
      }
    }
    if (enemyTargets.length === 0) return;

    const idleUnits = ownedUnits.filter(
      (lu) => !movedUnitIds.has(lu.unit.id) && lu.unit.movesRemaining > 0,
    );

    // Military moves all, others move up to 2
    const maxUnits = personality === 'military' ? idleUnits.length : Math.min(2, idleUnits.length);

    // Force concentration: pick one primary target (closest enemy) and send all units there
    // This prevents scattering units across multiple targets
    const primaryTarget = enemyTargets[0];
    const targetSet = new Set([`${primaryTarget.col},${primaryTarget.row}`]);

    let sent = 0;
    for (const lu of idleUnits) {
      if (sent >= maxUnits) break;
      const path = findPathToward(state.map, lu.coord, targetSet, lu.unit.movesRemaining);
      if (path && path.length > 0) {
        orders.push({ kind: 'move', unitId: lu.unit.id, path });
        movedUnitIds.add(lu.unit.id);
        sent++;
      }
    }
  }

  // --- Heuristic: Respond to active events ---
  function respondToEvents(): void {
    for (const event of state.activeEvents) {
      if (event.resolved) continue;
      if (!event.targetCivilizationIds.includes(civId)) continue;
      if (event.responses[civId]) continue; // already responded

      const eventDef = theme.events.find((e) => e.id === event.definitionId);
      if (!eventDef) continue;

      orders.push({
        kind: 'event_response',
        eventInstanceId: event.instanceId,
        choiceId: eventDef.defaultChoiceId,
      });
    }
  }

  // --- Heuristic: Research tech by personality ---
  function doResearch(): void {
    const availableTechs = theme.techTree.filter((tech) => {
      if (civ.completedTechs.includes(tech.id)) return false;
      return tech.prerequisites.every((p) => civ.completedTechs.includes(p));
    });
    if (availableTechs.length === 0) return;

    // Score techs based on personality
    function scoreTech(tech: typeof availableTechs[0]): number {
      let score = 0;
      for (const effect of tech.effects) {
        switch (personality) {
          case 'military':
            if (effect.kind === 'combat_modifier') score += 10;
            else if (effect.kind === 'unlock_unit') score += 8;
            break;
          case 'merchant':
            if (effect.kind === 'resource_modifier') score += 10;
            else if (effect.kind === 'unlock_building') score += 5;
            break;
          case 'diplomatic':
            if (effect.kind === 'stability_modifier') score += 10;
            else if (effect.kind === 'resource_modifier') score += 3;
            break;
          case 'pacifist':
            // Pacifist: prefer cheapest (score by inverse cost)
            break;
        }
      }
      // Tiebreaker: cheaper techs are slightly preferred
      score -= tech.cost / 100;
      return score;
    }

    const best = availableTechs.reduce((a, b) => (scoreTech(a) >= scoreTech(b) ? a : b));
    orders.push({
      kind: 'research',
      techId: best.id,
      pointsAllocated: 20,
    });
  }

  // --- Heuristic: Recruit units ---
  function doRecruit(): void {
    // Count current units
    const unitCount = ownedUnits.length;
    const currentDinars = civ.resources['dinars'] ?? 0;

    // Personality-driven thresholds
    const maxUnitThreshold = personality === 'military' ? 5
      : personality === 'pacifist' ? (enemyCivIds.length > 0 && unitCount === 0 ? 1 : 0)
      : 3;

    if (unitCount >= maxUnitThreshold) return;

    // Find affordable units the civ can recruit (has prereq tech)
    const availableUnits = theme.units.filter(
      (u) => (u.prerequisiteTech === null || civ.completedTechs.includes(u.prerequisiteTech))
        && u.cost <= currentDinars,
    );
    if (availableUnits.length === 0) return;

    // Pick cheapest available
    const cheapest = availableUnits.reduce((a, b) => (a.cost <= b.cost ? a : b));

    // Recruit at capital if possible, otherwise first controlled settlement
    const recruitHex = capitalHex ?? controlledSettlements[0];
    if (!recruitHex || !recruitHex.settlement) return;

    orders.push({
      kind: 'recruit',
      settlementId: recruitHex.settlement.id,
      unitDefinitionId: cheapest.id,
    });
  }

  // --- Heuristic: Diplomacy ---
  function doDiplomacy(): void {
    const allCivIds = Object.keys(state.civilizations).filter(
      (id) => id !== civId && !state.civilizations[id].isEliminated,
    );

    for (const targetId of allCivIds) {
      const relation = civ.diplomaticRelations[targetId];

      // If at war and stability < 40, propose peace
      if (relation === 'war' && civ.stability < 40) {
        orders.push({
          kind: 'diplomatic',
          actionType: 'propose_peace',
          targetCivId: targetId,
          payload: {},
        });
        continue;
      }

      // Military personality: declare war on weaker enemies if at peace
      if (personality === 'military' && relation === 'peace') {
        // Count visible enemy units
        const enemyUnits = state.map.flat().flatMap((h) =>
          h.units.filter((u) => u.civilizationId === targetId),
        );
        if (enemyUnits.length < ownedUnits.length && ownedUnits.length >= 3) {
          orders.push({
            kind: 'diplomatic',
            actionType: 'declare_war',
            targetCivId: targetId,
            payload: {},
          });
          break; // Only declare one war at a time
        }
      }
    }
  }

  // --- Heuristic: Build buildings by personality preference ---
  function doBuild(): void {
    const currentDinars = civ.resources['dinars'] ?? 0;

    // Personality-driven building preference order
    const buildingPrefs: Record<AIPersonality, string[]> = {
      military: ['barracks', 'stables', 'granary', 'market'],
      merchant: ['market', 'port', 'granary', 'library'],
      diplomatic: ['library', 'embassy', 'mosque', 'granary'],
      pacifist: ['library', 'granary', 'market', 'mosque'],
    };

    const prefOrder = buildingPrefs[personality];

    for (const buildingId of prefOrder) {
      const buildingDef = theme.buildings.find((b) => b.id === buildingId);
      if (!buildingDef) continue;
      if (currentDinars < buildingDef.cost) continue;

      // Check tech prereqs
      if (
        buildingDef.prerequisiteTech !== null &&
        !civ.completedTechs.includes(buildingDef.prerequisiteTech)
      ) continue;

      // Find a settlement that doesn't already have this building at max
      for (const hex of controlledSettlements) {
        if (!hex.settlement) continue;
        const existingCount = hex.settlement.buildings.filter((b) => b === buildingId).length;
        if (existingCount >= buildingDef.maxPerSettlement) continue;

        orders.push({
          kind: 'construction',
          settlementId: hex.settlement.id,
          buildingDefinitionId: buildingId,
        });
        return; // One build order per turn
      }
    }
  }

  // --- Heuristic: Trade offers ---
  function doTrade(): void {
    if (personality === 'military') return; // military rarely trades
    const resourceIds = theme.resources.map((r) => r.id);
    if (resourceIds.length < 2) return;

    // Compute average across resources
    const amounts = resourceIds.map((r) => civ.resources[r] ?? 0);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (avg <= 0) return;

    // Find surplus (>150% of avg) and deficit (<50% of avg)
    const surplusThreshold = personality === 'merchant' ? 1.2 : 1.5;
    const deficitThreshold = personality === 'merchant' ? 0.7 : 0.5;
    const surplus: Array<{ id: string; amount: number }> = [];
    const deficit: Array<{ id: string; amount: number }> = [];
    for (const r of resourceIds) {
      const amount = civ.resources[r] ?? 0;
      if (amount > avg * surplusThreshold) surplus.push({ id: r, amount: Math.floor((amount - avg) / 2) });
      else if (amount < avg * deficitThreshold) deficit.push({ id: r, amount: Math.floor(avg - amount) });
    }

    if (surplus.length === 0 || deficit.length === 0) return;

    // Offer first surplus for first deficit to first non-war civ
    const allCivIds = Object.keys(state.civilizations).filter(
      (id) => id !== civId && !state.civilizations[id].isEliminated &&
        civ.diplomaticRelations[id] !== 'war',
    );
    if (allCivIds.length === 0) return;

    const targetId = allCivIds[0];
    const offerRes = surplus[0];
    const requestRes = deficit[0];
    const tradeAmount = Math.min(offerRes.amount, requestRes.amount, 10);
    if (tradeAmount <= 0) return;

    orders.push({
      kind: 'diplomatic',
      actionType: 'offer_trade',
      targetCivId: targetId,
      payload: {
        offer: { [offerRes.id]: tradeAmount },
        request: { [requestRes.id]: tradeAmount },
      },
    });
  }

  // --- Personality-driven priority ordering ---
  const heuristics: Record<string, () => void> = {
    garrison: garrisonCapital,
    recruit: doRecruit,
    diplomacy: doDiplomacy,
    trade: doTrade,
    attack: attackEnemies,
    expand: expandToUnclaimed,
    research: doResearch,
    build: doBuild,
    events: respondToEvents,
  };

  const priorityMap: Record<AIPersonality, string[]> = {
    military: ['garrison', 'recruit', 'diplomacy', 'attack', 'expand', 'events', 'research', 'build'],
    diplomatic: ['garrison', 'diplomacy', 'trade', 'events', 'research', 'recruit', 'build', 'expand', 'attack'],
    merchant: ['garrison', 'diplomacy', 'trade', 'expand', 'events', 'recruit', 'build', 'research', 'attack'],
    pacifist: ['diplomacy', 'trade', 'events', 'research', 'recruit', 'build'],
  };

  const priorities = priorityMap[personality];
  for (const key of priorities) {
    heuristics[key]?.();
  }

  return {
    playerId: `ai_${civId}`,
    civilizationId: civId,
    turnNumber: state.turn,
    orders,
    submittedAt,
  };
}

// ---------------------------------------------------------------------------
// Fill missing orders for all civs that did not submit
// ---------------------------------------------------------------------------

export function fillMissingOrdersWithAI(
  state: GameState,
  submitted: PlayerOrders[],
  theme: ThemePackage,
  prng: PRNG,
  submittedAt: string,
): PlayerOrders[] {
  const submittedCivIds = new Set(submitted.map((o) => o.civilizationId));
  const allOrders = [...submitted];

  for (const civId of Object.keys(state.civilizations)) {
    const civ = state.civilizations[civId];
    if (!civ.isEliminated && !submittedCivIds.has(civId)) {
      allOrders.push(generateAIOrders(state, civId, theme, prng.fork(), submittedAt));
    }
  }

  return allOrders;
}
