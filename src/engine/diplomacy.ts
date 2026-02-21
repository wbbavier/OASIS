// Diplomacy resolution — processes diplomatic orders, updates relations symmetrically.
// War costs stability, peace/alliance require mutual proposal in the same turn.
// Pure function: no side effects, no async, no randomness.

import type {
  GameState,
  PlayerOrders,
  RelationshipState,
  CivilizationState,
  DiplomaticMessage,
} from '@/engine/types';
import type { DiplomaticActionType } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Tech gate check — unlock_diplomacy_action
// ---------------------------------------------------------------------------

function civHasDiplomacyActionUnlocked(
  civId: string,
  actionType: DiplomaticActionType,
  state: GameState,
  theme: ThemePackage,
): boolean {
  // Check if any tech has unlock_diplomacy_action for this action type
  const requiresTech = theme.techTree.some((t) =>
    t.effects.some(
      (e) => e.kind === 'custom' && e.key === 'unlock_diplomacy_action' && e.value === actionType,
    ),
  );
  if (!requiresTech) return true; // no tech gates this action

  // Check if the civ has completed a tech that unlocks it
  const civ = state.civilizations[civId];
  if (!civ) return false;
  for (const techId of civ.completedTechs) {
    const techDef = theme.techTree.find((t) => t.id === techId);
    if (!techDef) continue;
    for (const effect of techDef.effects) {
      if (effect.kind === 'custom' && effect.key === 'unlock_diplomacy_action' && effect.value === actionType) {
        return true;
      }
    }
  }
  return false;
}

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

function applyStabilityPenalty(
  civs: Record<string, CivilizationState>,
  civId: string,
  penalty: number,
): Record<string, CivilizationState> {
  const civ = civs[civId];
  if (!civ) return civs;
  return {
    ...civs,
    [civId]: {
      ...civ,
      stability: Math.max(0, Math.min(100, civ.stability + penalty)),
    },
  };
}

// ---------------------------------------------------------------------------
// Main diplomacy resolution
// ---------------------------------------------------------------------------

export interface DiplomacyResult {
  state: GameState;
  diplomaticMessages: DiplomaticMessage[];
}

export interface TradeExecution {
  civA: string;
  civB: string;
  aGives: Record<string, number>;
  bGives: Record<string, number>;
}

export function resolveDiplomacy(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): DiplomacyResult {
  void theme;
  let civs = { ...state.civilizations };
  const diplomaticMessages: DiplomaticMessage[] = [];

  // Collect all proposals so we can check for mutual ones
  const proposals: Array<{
    source: string;
    target: string;
    actionType: DiplomaticActionType;
    payload: Record<string, unknown>;
  }> = [];

  for (const playerOrders of orders) {
    const sourceCivId = playerOrders.civilizationId;
    if (!civs[sourceCivId]) continue;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'diplomatic') continue;
      proposals.push({
        source: sourceCivId,
        target: order.targetCivId,
        actionType: order.actionType,
        payload: order.payload,
      });
    }
  }

  // Process immediate actions (declare_war, break_alliance)
  for (const proposal of proposals) {
    const { source, target, actionType } = proposal;
    if (!civs[target]) continue;

    // Tech gate check: skip action if civ hasn't unlocked it
    if (!civHasDiplomacyActionUnlocked(source, actionType, state, theme)) continue;

    switch (actionType) {
      case 'declare_war': {
        civs = setRelationSymmetric(civs, source, target, 'war');
        // War declaration costs -10 stability to the declarer
        civs = applyStabilityPenalty(civs, source, -10);

        // War cascade: target's alliance partners also go to war
        const targetRelations = civs[target]?.diplomaticRelations ?? {};
        for (const [allyId, rel] of Object.entries(targetRelations)) {
          if (rel === 'alliance' && civs[allyId]) {
            civs = setRelationSymmetric(civs, source, allyId, 'war');
          }
        }
        break;
      }

      case 'break_alliance': {
        civs = setRelationSymmetric(civs, source, target, 'peace');
        // Breaking alliance costs -5 stability to the breaker
        civs = applyStabilityPenalty(civs, source, -5);
        break;
      }

      case 'propose_vassalage': {
        // Vassalage is immediate (one-sided declaration)
        civs = setRelationSymmetric(civs, source, target, 'vassal');
        break;
      }

      // send_message — collect message for delivery
      case 'send_message': {
        const msgText = typeof proposal.payload?.message === 'string'
          ? proposal.payload.message
          : '';
        if (msgText.length > 0) {
          diplomaticMessages.push({
            fromCivId: source,
            toCivId: target,
            message: msgText,
          });
        }
        break;
      }

      // offer_trade — handled in mutual matching below
      case 'offer_trade':
        break;

      // propose_peace, propose_alliance, propose_truce — require mutual
      default:
        break;
    }
  }

  // Process mutual proposals (peace, alliance, truce)
  const mutualActions: Array<{
    actionType: 'propose_peace' | 'propose_alliance' | 'propose_truce';
    relation: RelationshipState;
  }> = [
    { actionType: 'propose_peace', relation: 'peace' },
    { actionType: 'propose_alliance', relation: 'alliance' },
    { actionType: 'propose_truce', relation: 'truce' },
  ];

  for (const { actionType, relation } of mutualActions) {
    const actionProposals = proposals.filter((p) => p.actionType === actionType);

    for (const proposal of actionProposals) {
      // Check if the other side also proposed the same action
      const mutual = actionProposals.some(
        (p) => p.source === proposal.target && p.target === proposal.source,
      );
      if (mutual) {
        civs = setRelationSymmetric(civs, proposal.source, proposal.target, relation);
      }
      // If not mutual, the proposal is logged but has no effect
    }
  }

  // Process trade offers — match compatible trades
  const tradeOffers = proposals.filter((p) => p.actionType === 'offer_trade');
  const matchedTradeKeys = new Set<string>();
  const executedTrades: TradeExecution[] = [];

  for (const offer of tradeOffers) {
    const offerKey = `${offer.source}->${offer.target}`;
    if (matchedTradeKeys.has(offerKey)) continue;

    const offerPayloadRaw = offer.payload as { offer?: Record<string, number>; request?: Record<string, number> } | undefined;
    if (!offerPayloadRaw?.offer || !offerPayloadRaw?.request) continue;
    const offerPayload = { offer: offerPayloadRaw.offer, request: offerPayloadRaw.request };

    // Find a counter-offer from target to source
    const counterOffer = tradeOffers.find((p) => {
      if (p.source !== offer.target || p.target !== offer.source) return false;
      const counterKey = `${p.source}->${p.target}`;
      if (matchedTradeKeys.has(counterKey)) return false;
      const cp = p.payload as { offer?: Record<string, number>; request?: Record<string, number> } | undefined;
      if (!cp?.offer || !cp?.request) return false;

      // Match: A offers what B requests and B offers what A requests
      for (const [resId, amount] of Object.entries(offerPayload.offer)) {
        if ((cp.request[resId] ?? 0) > amount) return false;
      }
      for (const [resId, amount] of Object.entries(offerPayload.request)) {
        if ((cp.offer[resId] ?? 0) < amount) return false;
      }
      return true;
    });

    if (!counterOffer) continue;

    const counterPayload = counterOffer.payload as { offer: Record<string, number>; request: Record<string, number> };

    // Validate both sides have sufficient resources
    const civA = civs[offer.source];
    const civB = civs[offer.target];
    if (!civA || !civB) continue;

    let aCanAfford = true;
    for (const [resId, amount] of Object.entries(offerPayload.offer)) {
      if ((civA.resources[resId] ?? 0) < amount) { aCanAfford = false; break; }
    }
    let bCanAfford = true;
    for (const [resId, amount] of Object.entries(counterPayload.offer)) {
      if ((civB.resources[resId] ?? 0) < amount) { bCanAfford = false; break; }
    }

    if (!aCanAfford || !bCanAfford) continue;

    // Execute the trade
    const aRes = { ...civA.resources };
    const bRes = { ...civB.resources };
    for (const [resId, amount] of Object.entries(offerPayload.offer)) {
      aRes[resId] = (aRes[resId] ?? 0) - amount;
      bRes[resId] = (bRes[resId] ?? 0) + amount;
    }
    for (const [resId, amount] of Object.entries(counterPayload.offer)) {
      bRes[resId] = (bRes[resId] ?? 0) - amount;
      aRes[resId] = (aRes[resId] ?? 0) + amount;
    }

    civs = {
      ...civs,
      [offer.source]: { ...civA, resources: aRes },
      [offer.target]: { ...civB, resources: bRes },
    };

    matchedTradeKeys.add(offerKey);
    matchedTradeKeys.add(`${counterOffer.source}->${counterOffer.target}`);
    executedTrades.push({
      civA: offer.source,
      civB: offer.target,
      aGives: offerPayload.offer,
      bGives: counterPayload.offer,
    });
  }

  return { state: { ...state, civilizations: civs }, diplomaticMessages };
}
