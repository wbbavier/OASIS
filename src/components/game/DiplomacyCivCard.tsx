// Individual civilization diplomacy card for DiplomacyPanel.

import type { DiplomaticAction, DiplomaticActionType } from '@/engine/types';
import type { CivilizationDefinition, DiplomacyOption } from '@/themes/schema';

interface DiplomacyCivCardProps {
  civDef: CivilizationDefinition;
  relation: string;
  relationLabel: string;
  relationColor: string;
  options: DiplomacyOption[];
  pending: DiplomaticAction | undefined;
  messageText: string;
  onAction: (actionType: DiplomaticActionType) => void;
  onMessageChange: (text: string) => void;
}

export function DiplomacyCivCard({
  civDef, relationLabel, relationColor, options, pending,
  messageText, onAction, onMessageChange,
}: DiplomacyCivCardProps) {
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-800 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: civDef.color }} />
        <span className="text-sm font-semibold text-stone-100">{civDef.name}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${relationColor}`}>
          {relationLabel}
        </span>
      </div>

      {options.length === 0 ? (
        <p className="text-xs text-stone-600 italic">No actions available.</p>
      ) : (
        <div className="space-y-1.5">
          {options.map((opt) => {
            const actionType = opt.actionType as DiplomaticActionType;
            const isSelected = pending?.actionType === actionType;
            return (
              <div key={actionType}>
                <button
                  onClick={() => onAction(actionType)}
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
                    placeholder="Your message\u2026"
                    value={messageText}
                    onChange={(e) => onMessageChange(e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
