'use client';
import type { GameState, AnyOrder, ConstructionOrder, Hex, Settlement } from '@/engine/types';
import type { ThemePackage, BuildingDefinition } from '@/themes/schema';

interface SettlementWithCoord {
  settlement: Settlement;
  hex: Hex;
}

function getPlayerSettlements(map: Hex[][], civId: string): SettlementWithCoord[] {
  const results: SettlementWithCoord[] = [];
  for (const row of map) {
    for (const hex of row) {
      if (hex.controlledBy === civId && hex.settlement) {
        results.push({ settlement: hex.settlement, hex });
      }
    }
  }
  return results;
}

interface BuildPanelProps {
  gameState: GameState;
  theme: ThemePackage;
  currentCivId: string;
  pendingOrders: AnyOrder[];
  setPendingOrders: (orders: AnyOrder[]) => void;
}

function BuildingEffects({ building }: { building: BuildingDefinition }) {
  if (building.effects.length === 0) return null;
  return (
    <span className="text-xs text-stone-400">
      {building.effects.map((e) => `${e.resourceId} ${e.delta > 0 ? '+' : ''}${e.delta}`).join(' · ')}
    </span>
  );
}

export function BuildPanel({
  gameState,
  theme,
  currentCivId,
  pendingOrders,
  setPendingOrders,
}: BuildPanelProps) {
  const civ = gameState.civilizations[currentCivId];
  if (!civ) return null;

  const settlements = getPlayerSettlements(gameState.map, currentCivId);

  if (settlements.length === 0) {
    return <p className="text-sm text-stone-500 italic">You control no settlements.</p>;
  }

  function getAvailableBuildings(settlement: Settlement): BuildingDefinition[] {
    return theme.buildings.filter((b) => {
      if (settlement.buildings.includes(b.id)) return false;
      if (b.prerequisiteTech && !civ.completedTechs.includes(b.prerequisiteTech)) return false;
      return true;
    });
  }

  function getPendingBuildForSettlement(settlementId: string): ConstructionOrder | undefined {
    return pendingOrders.find(
      (o): o is ConstructionOrder =>
        o.kind === 'construction' && o.settlementId === settlementId
    );
  }

  function selectBuilding(settlementId: string, buildingDefinitionId: string) {
    const existing = pendingOrders.find(
      (o): o is ConstructionOrder =>
        o.kind === 'construction' && o.settlementId === settlementId
    );
    if (existing?.buildingDefinitionId === buildingDefinitionId) {
      // deselect
      setPendingOrders(
        pendingOrders.filter(
          (o) => !(o.kind === 'construction' && (o as ConstructionOrder).settlementId === settlementId)
        )
      );
    } else {
      const next: ConstructionOrder = { kind: 'construction', settlementId, buildingDefinitionId };
      setPendingOrders([
        ...pendingOrders.filter(
          (o) => !(o.kind === 'construction' && (o as ConstructionOrder).settlementId === settlementId)
        ),
        next,
      ]);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">Select a building to construct in each settlement.</p>
      {settlements.map(({ settlement }) => {
        const available = getAvailableBuildings(settlement);
        const pending = getPendingBuildForSettlement(settlement.id);
        return (
          <div key={settlement.id} className="rounded-lg border border-stone-700 bg-stone-800 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-stone-100">{settlement.name}</span>
              <span className="rounded bg-stone-700 px-1.5 py-0.5 text-[10px] text-stone-400 capitalize">
                {settlement.type}
              </span>
              <span className="text-xs text-stone-500">Pop {settlement.population}</span>
            </div>

            {settlement.buildings.length > 0 && (
              <p className="text-xs text-stone-500 mb-2">
                Built: {settlement.buildings.join(', ')}
              </p>
            )}

            {available.length === 0 ? (
              <p className="text-xs text-stone-600 italic">No buildings available.</p>
            ) : (
              <div className="space-y-1.5">
                {available.map((b) => {
                  const isSelected = pending?.buildingDefinitionId === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => selectBuilding(settlement.id, b.id)}
                      className={`w-full text-left rounded border px-2.5 py-1.5 transition-colors ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-900/40'
                          : 'border-stone-600 bg-stone-900/50 hover:border-stone-500'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-stone-100">{b.name}</span>
                          <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{b.description}</p>
                          <BuildingEffects building={b} />
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs text-amber-400">{b.cost}g</div>
                          <div className="text-xs text-stone-500">-{b.upkeep}/turn</div>
                          {isSelected && (
                            <div className="text-[10px] text-emerald-400">Queued</div>
                          )}
                        </div>
                      </div>
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
