'use client';
import type { GameState, AnyOrder } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

interface RecruitPanelProps {
  gameState: GameState;
  theme: ThemePackage;
  currentCivId: string;
  pendingOrders: AnyOrder[];
  setPendingOrders: (orders: AnyOrder[]) => void;
}

export function RecruitPanel({
  gameState,
  theme,
  currentCivId,
  pendingOrders,
  setPendingOrders,
}: RecruitPanelProps) {
  const civ = gameState.civilizations[currentCivId];
  if (!civ) return null;

  const controlledSettlements = gameState.map.flat().filter(
    (h) => h.controlledBy === currentCivId && h.settlement !== null,
  );

  // Units available to recruit (tech prereqs met or no prereq)
  const availableUnits = theme.units.filter(
    (u) => u.prerequisiteTech === null || civ.completedTechs.includes(u.prerequisiteTech),
  );

  const currentDinars = civ.resources['dinars'] ?? 0;

  // Settlements already targeted for recruitment this turn
  const recruitedSettlementIds = new Set(
    pendingOrders
      .filter((o) => o.kind === 'recruit')
      .map((o) => (o as { settlementId: string }).settlementId),
  );

  function handleRecruit(settlementId: string, unitDefinitionId: string) {
    setPendingOrders([
      ...pendingOrders,
      { kind: 'recruit' as const, settlementId, unitDefinitionId },
    ]);
  }

  if (controlledSettlements.length === 0) {
    return <p className="text-sm text-stone-500">No controlled settlements.</p>;
  }

  if (availableUnits.length === 0) {
    return <p className="text-sm text-stone-500">No units available to recruit.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {controlledSettlements.map((hex) => {
        const settlement = hex.settlement!;
        const alreadyRecruited = recruitedSettlementIds.has(settlement.id);

        return (
          <div key={settlement.id} className="rounded-lg border border-stone-700 p-3">
            <h4 className="text-sm font-semibold text-stone-200 mb-2">
              {settlement.name}
              {settlement.isCapital && (
                <span className="ml-2 text-xs text-amber-400">(Capital)</span>
              )}
              {alreadyRecruited && (
                <span className="ml-2 text-xs text-stone-500">(Order placed)</span>
              )}
            </h4>

            {alreadyRecruited ? (
              <p className="text-xs text-stone-500">One recruit per settlement per turn.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableUnits.map((unitDef) => {
                  const canAfford = currentDinars >= unitDef.cost;
                  return (
                    <button
                      key={unitDef.id}
                      disabled={!canAfford}
                      onClick={() => handleRecruit(settlement.id, unitDef.id)}
                      className={`rounded px-3 py-1.5 text-xs border transition-colors ${
                        canAfford
                          ? 'border-indigo-600 text-indigo-300 hover:bg-indigo-900/50'
                          : 'border-stone-700 text-stone-600 cursor-not-allowed'
                      }`}
                      title={`${unitDef.name}: Str ${unitDef.strength}, Moves ${unitDef.moves}, Cost ${unitDef.cost}d`}
                    >
                      {unitDef.name} ({unitDef.cost}d)
                    </button>
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
