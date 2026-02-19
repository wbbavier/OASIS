'use client';
import type { CivilizationDefinition } from '@/themes/schema';
import { CivCard } from './CivCard';

interface CivGridProps {
  civs: CivilizationDefinition[];
  disabledIds?: Set<string>;
  selectedId?: string | null;
  onSelect: (civId: string) => void;
}

export function CivGrid({ civs, disabledIds = new Set(), selectedId, onSelect }: CivGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {civs.map((civ) => (
        <CivCard
          key={civ.id}
          civ={civ}
          selected={selectedId === civ.id}
          disabled={disabledIds.has(civ.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
