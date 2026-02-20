'use client';
import type { GameState, AnyOrder, ResearchOrder } from '@/engine/types';
import type { ThemePackage, TechDefinition } from '@/themes/schema';

interface ResearchPanelProps {
  gameState: GameState;
  theme: ThemePackage;
  currentCivId: string;
  pendingOrders: AnyOrder[];
  setPendingOrders: (orders: AnyOrder[]) => void;
}

function TechEffectSummary({ tech }: { tech: TechDefinition }) {
  const lines = tech.effects.map((e) => {
    if (e.kind === 'unlock_unit') return `Unlocks unit: ${e.unitDefinitionId}`;
    if (e.kind === 'unlock_building') return `Unlocks building: ${e.buildingDefinitionId}`;
    if (e.kind === 'resource_modifier') return `${e.resourceId} ×${e.multiplier}`;
    if (e.kind === 'combat_modifier') return `Combat ${e.value > 0 ? '+' : ''}${e.value}`;
    if (e.kind === 'stability_modifier') return `Stability ${e.value > 0 ? '+' : ''}${e.value}`;
    if (e.kind === 'custom') return `${e.key}`;
    return '';
  });
  return <span className="text-xs text-stone-400">{lines.join(' · ')}</span>;
}

export function ResearchPanel({
  gameState,
  theme,
  currentCivId,
  pendingOrders,
  setPendingOrders,
}: ResearchPanelProps) {
  const civ = gameState.civilizations[currentCivId];
  if (!civ) return null;

  const selectedResearch = pendingOrders.find((o): o is ResearchOrder => o.kind === 'research');

  const available = theme.techTree.filter(
    (t) =>
      !civ.completedTechs.includes(t.id) &&
      t.prerequisites.every((p) => civ.completedTechs.includes(p))
  );

  const inProgress = theme.techTree.filter(
    (t) => (civ.techProgress[t.id] ?? 0) > 0 && !civ.completedTechs.includes(t.id)
  );

  function selectTech(techId: string) {
    const next: ResearchOrder = { kind: 'research', techId, pointsAllocated: 100 };
    setPendingOrders([
      ...pendingOrders.filter((o) => o.kind !== 'research'),
      next,
    ]);
  }

  function clearSelection() {
    setPendingOrders(pendingOrders.filter((o) => o.kind !== 'research'));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        Select one technology to research this turn.
      </p>

      {inProgress.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">In Progress</p>
          {inProgress.map((t) => {
            const progress = civ.techProgress[t.id] ?? 0;
            const pct = Math.min(100, Math.round((progress / t.cost) * 100));
            return (
              <div key={t.id} className="rounded bg-stone-800 px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-stone-200">{t.name}</span>
                  <span className="text-xs text-stone-400">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-700">
                  <div
                    className="h-1.5 rounded-full bg-indigo-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {available.length === 0 ? (
        <p className="text-sm text-stone-500 italic">No technologies available to research.</p>
      ) : (
        <div className="space-y-2">
          {available.map((t) => {
            const isSelected = selectedResearch?.techId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => (isSelected ? clearSelection() : selectTech(t.id))}
                className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-900/40'
                    : 'border-stone-700 bg-stone-800 hover:border-stone-500'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-stone-100">{t.name}</span>
                      <span className="rounded bg-stone-700 px-1.5 py-0.5 text-[10px] text-stone-400">
                        {t.era}
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{t.description}</p>
                    <div className="mt-1">
                      <TechEffectSummary tech={t} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs text-amber-400">{t.cost} pts</span>
                    {isSelected && (
                      <div className="text-[10px] text-indigo-400 mt-0.5">Selected</div>
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
}
