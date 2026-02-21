import type { TerrainType } from '@/engine/types';
import { TERRAIN_FILL } from '@/components/map/hex-utils';

const TERRAIN_LABELS: Array<{ terrain: TerrainType; label: string }> = [
  { terrain: 'plains', label: 'Plains' },
  { terrain: 'forest', label: 'Forest' },
  { terrain: 'mountains', label: 'Mountains' },
  { terrain: 'desert', label: 'Desert' },
  { terrain: 'coast', label: 'Coast' },
  { terrain: 'sea', label: 'Sea' },
  { terrain: 'river', label: 'River' },
];

export function TerrainLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-2 py-1.5 text-xs text-stone-400">
      {TERRAIN_LABELS.map(({ terrain, label }) => (
        <span key={terrain} className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-stone-600"
            style={{ backgroundColor: TERRAIN_FILL[terrain] }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
