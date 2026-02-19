// Diplomacy resolution — Phase 2c implementation.
// Processes diplomatic orders, updates relations symmetrically, handles war cascade.
// Pure function: no side effects, no async, no randomness.

import type {
  GameState,
  PlayerOrders,
  RelationshipState,
  CivilizationState,
} from '@/engine/types';
import type { DiplomaticActionType } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Relation mapping
// ---------------------------------------------------------------------------

const ACTION_RELATION: Partial<Record<DiplomaticActionType, RelationshipState>> = {
  declare_war: 'war',
  propose_peace: 'peace',
  propose_alliance: 'alliance',
  break_alliance: 'peace',
  propose_truce: 'truce',
  propose_vassalage: 'vassal',
  // send_message and offer_trade do not change diplomatic state
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setRelationSymmetric(
  civs: Record<string, CivilizationState>,
  civA: string,
  civB: string,
  relation: RelationshipState,
): Record<string, CivilizationState> {
  const civAState = civs[civA];
  const civBState = civs[civB];
  if (!civAState || !civBState) return civs;

  return {
    ...civs,
    [civA]: {
      ...civAState,
      diplomaticRelations: { ...civAState.diplomaticRelations, [civB]: relation },
    },
    [civB]: {
      ...civBState,
      diplomaticRelations: { ...civBState.diplomaticRelations, [civA]: relation },
    },
  };
}

// ---------------------------------------------------------------------------
// Main diplomacy resolution
// ---------------------------------------------------------------------------

export function resolveDiplomacy(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): GameState {
  void theme;
  let civs = { ...state.civilizations };

  for (const playerOrders of orders) {
    const sourceCivId = playerOrders.civilizationId;
    if (!civs[sourceCivId]) continue;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'diplomatic') continue;

      const { actionType, targetCivId } = order;
      if (!civs[targetCivId]) continue;

      const newRelation = ACTION_RELATION[actionType];
      if (!newRelation) continue; // send_message, offer_trade — no relation change

      civs = setRelationSymmetric(civs, sourceCivId, targetCivId, newRelation);

      // War cascade: on declare_war, target's alliance partners also go to war
      // with the declaring civ (one level only, symmetric)
      if (actionType === 'declare_war') {
        const targetRelations = civs[targetCivId]?.diplomaticRelations ?? {};
        for (const [allyId, rel] of Object.entries(targetRelations)) {
          if (rel === 'alliance' && civs[allyId]) {
            civs = setRelationSymmetric(civs, sourceCivId, allyId, 'war');
          }
        }
      }
    }
  }

  return { ...state, civilizations: civs };
}
