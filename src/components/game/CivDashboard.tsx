import type { CivilizationState, RelationshipState } from '@/engine/types';
import type { CivilizationDefinition, ResourceDefinition } from '@/themes/schema';
import { Card } from '@/components/ui/Card';

const RELATION_LABEL: Record<RelationshipState, { label: string; color: string }> = {
  peace:    { label: 'Peace',    color: 'text-stone-300' },
  alliance: { label: 'Alliance', color: 'text-emerald-400' },
  war:      { label: 'War',      color: 'text-red-400' },
  truce:    { label: 'Truce',    color: 'text-yellow-400' },
  vassal:   { label: 'Vassal',   color: 'text-indigo-400' },
};

interface CivDashboardProps {
  civ: CivilizationState;
  civDef: CivilizationDefinition;
  allCivDefs: CivilizationDefinition[];
  resources: ResourceDefinition[];
  turn: number;
}

export function CivDashboard({ civ, civDef, allCivDefs, resources, turn }: CivDashboardProps) {
  const stabilityPct = Math.max(0, Math.min(100, civ.stability));

  return (
    <div className="flex flex-col gap-3 w-64 flex-shrink-0">
      {/* Civ identity */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: civDef.color }} />
          <span className="font-semibold text-stone-100 text-sm">{civDef.name}</span>
        </div>
        <p className="text-xs text-stone-500">Turn {turn}</p>
      </Card>

      {/* Resources */}
      <Card className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Resources</h3>
        <ul className="flex flex-col gap-1">
          {resources.map((r) => (
            <li key={r.id} className="flex justify-between text-sm">
              <span className="text-stone-400">{r.name}</span>
              <span className="font-mono text-stone-200">{civ.resources[r.id] ?? 0}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Stability */}
      <Card className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Stability</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-stone-700">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${stabilityPct}%`,
                backgroundColor: stabilityPct > 60 ? '#4ade80' : stabilityPct > 30 ? '#facc15' : '#f87171',
              }}
            />
          </div>
          <span className="text-xs text-stone-300 w-8 text-right">{stabilityPct}%</span>
        </div>
      </Card>

      {/* Relations */}
      <Card className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Diplomacy</h3>
        <ul className="flex flex-col gap-1">
          {allCivDefs
            .filter((d) => d.id !== civDef.id)
            .map((d) => {
              const rel = civ.diplomaticRelations[d.id] ?? 'peace';
              const { label, color } = RELATION_LABEL[rel];
              return (
                <li key={d.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-stone-400 truncate">{d.name}</span>
                  </span>
                  <span className={`text-xs font-medium ${color}`}>{label}</span>
                </li>
              );
            })}
        </ul>
      </Card>
    </div>
  );
}
