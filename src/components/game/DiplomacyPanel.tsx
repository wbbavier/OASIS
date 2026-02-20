'use client';
import { useState } from 'react';
import type { GameState, AnyOrder, DiplomaticAction, DiplomaticActionType, RelationshipState } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

interface DiplomacyPanelProps {
  gameState: GameState;
  theme: ThemePackage;
  currentCivId: string;
  pendingOrders: AnyOrder[];
  setPendingOrders: (orders: AnyOrder[]) => void;
}

const RELATION_LABELS: Record<RelationshipState, string> = {
  peace: 'Peace',
  alliance: 'Alliance',
  war: 'War',
  truce: 'Truce',
  vassal: 'Vassal',
};

const RELATION_COLORS: Record<RelationshipState, string> = {
  peace: 'text-stone-400 bg-stone-700',
  alliance: 'text-emerald-300 bg-emerald-900',
  war: 'text-red-300 bg-red-900',
  truce: 'text-yellow-300 bg-yellow-900',
  vassal: 'text-purple-300 bg-purple-900',
};

export function DiplomacyPanel({
  gameState,
  theme,
  currentCivId,
  pendingOrders,
  setPendingOrders,
}: DiplomacyPanelProps) {
  const [messageText, setMessageText] = useState<Record<string, string>>({});

  const civ = gameState.civilizations[currentCivId];
  if (!civ) return null;

  const otherCivDefs = theme.civilizations.filter((c) => c.id !== currentCivId);

  function getRelation(targetCivId: string): RelationshipState {
    return civ.diplomaticRelations[targetCivId] ?? 'peace';
  }

  function getPendingAction(targetCivId: string): DiplomaticAction | undefined {
    return pendingOrders.find(
      (o): o is DiplomaticAction => o.kind === 'diplomatic' && o.targetCivId === targetCivId
    );
  }

  function selectAction(targetCivId: string, actionType: DiplomaticActionType) {
    const existing = getPendingAction(targetCivId);
    if (existing?.actionType === actionType) {
      // deselect
      setPendingOrders(
        pendingOrders.filter(
          (o) => !(o.kind === 'diplomatic' && (o as DiplomaticAction).targetCivId === targetCivId)
        )
      );
      return;
    }
    const payload: Record<string, unknown> =
      actionType === 'send_message' ? { message: messageText[targetCivId] ?? '' } : {};
    const next: DiplomaticAction = { kind: 'diplomatic', actionType, targetCivId, payload };
    setPendingOrders([
      ...pendingOrders.filter(
        (o) => !(o.kind === 'diplomatic' && (o as DiplomaticAction).targetCivId === targetCivId)
      ),
      next,
    ]);
  }

  function updateMessage(targetCivId: string, text: string) {
    setMessageText((prev) => ({ ...prev, [targetCivId]: text }));
    // If send_message is already pending for this civ, update its payload
    const existing = getPendingAction(targetCivId);
    if (existing?.actionType === 'send_message') {
      setPendingOrders([
        ...pendingOrders.filter(
          (o) => !(o.kind === 'diplomatic' && (o as DiplomaticAction).targetCivId === targetCivId)
        ),
        { ...existing, payload: { message: text } },
      ]);
    }
  }

  if (otherCivDefs.length === 0) {
    return <p className="text-sm text-stone-500 italic">No other civilizations in this game.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">Select a diplomatic action for each civilization.</p>
      {otherCivDefs.map((civDef) => {
        const relation = getRelation(civDef.id);
        const pending = getPendingAction(civDef.id);
        const availableOptions = theme.diplomacyOptions.filter((opt) =>
          opt.allowedStates.includes(relation)
        );

        return (
          <div key={civDef.id} className="rounded-lg border border-stone-700 bg-stone-800 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: civDef.color }}
              />
              <span className="text-sm font-semibold text-stone-100">{civDef.name}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${RELATION_COLORS[relation]}`}
              >
                {RELATION_LABELS[relation]}
              </span>
            </div>

            {availableOptions.length === 0 ? (
              <p className="text-xs text-stone-600 italic">No actions available.</p>
            ) : (
              <div className="space-y-1.5">
                {availableOptions.map((opt) => {
                  const actionType = opt.actionType as DiplomaticActionType;
                  const isSelected = pending?.actionType === actionType;
                  return (
                    <div key={actionType}>
                      <button
                        onClick={() => selectAction(civDef.id, actionType)}
                        className={`w-full text-left rounded border px-2.5 py-1.5 transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-900/40'
                            : 'border-stone-600 hover:border-stone-500 bg-stone-900/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm text-stone-100 capitalize">
                              {actionType.replace(/_/g, ' ')}
                            </span>
                            <p className="text-xs text-stone-400 mt-0.5">{opt.description}</p>
                          </div>
                          {isSelected && (
                            <span className="text-[10px] text-blue-400 shrink-0">Selected</span>
                          )}
                        </div>
                      </button>
                      {actionType === 'send_message' && isSelected && (
                        <textarea
                          className="mt-1 w-full rounded border border-stone-600 bg-stone-900 px-2 py-1.5 text-xs text-stone-200 placeholder-stone-600 resize-none focus:outline-none focus:border-blue-500"
                          rows={2}
                          placeholder="Your message…"
                          value={messageText[civDef.id] ?? ''}
                          onChange={(e) => updateMessage(civDef.id, e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
