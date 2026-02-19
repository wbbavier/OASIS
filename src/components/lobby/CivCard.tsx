'use client';
import type { CivilizationDefinition } from '@/themes/schema';

interface CivCardProps {
  civ: CivilizationDefinition;
  selected?: boolean;
  disabled?: boolean;
  onSelect: (civId: string) => void;
}

export function CivCard({ civ, selected = false, disabled = false, onSelect }: CivCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(civ.id)}
      className={`relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all
        ${disabled
          ? 'cursor-not-allowed border-stone-700 bg-stone-900 opacity-50'
          : selected
          ? 'cursor-default border-indigo-500 bg-stone-800 ring-2 ring-indigo-500'
          : 'cursor-pointer border-stone-700 bg-stone-900 hover:border-stone-500 hover:bg-stone-800'
        }`}
    >
      <div className="flex items-center gap-3">
        <span
          className="h-4 w-4 flex-shrink-0 rounded-full"
          style={{ backgroundColor: civ.color }}
          aria-hidden="true"
        />
        <span className="font-semibold text-stone-100">{civ.name}</span>
        {disabled && (
          <span className="ml-auto rounded bg-stone-700 px-2 py-0.5 text-xs text-stone-400">
            Taken
          </span>
        )}
        {selected && (
          <span className="ml-auto rounded bg-indigo-700 px-2 py-0.5 text-xs text-indigo-200">
            Selected
          </span>
        )}
      </div>
      <p className="text-sm text-stone-400 line-clamp-2">{civ.description}</p>
    </button>
  );
}
