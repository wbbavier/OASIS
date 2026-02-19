import Link from 'next/link';

interface GameCardProps {
  id: string;
  name: string;
  themeName: string;
  phase: string;
  playerCount: number;
}

const phaseLabel: Record<string, { label: string; className: string }> = {
  lobby: { label: 'Lobby', className: 'bg-yellow-800 text-yellow-200' },
  active: { label: 'Active', className: 'bg-emerald-800 text-emerald-200' },
  paused: { label: 'Paused', className: 'bg-stone-700 text-stone-300' },
  completed: { label: 'Completed', className: 'bg-stone-700 text-stone-400' },
};

export function GameCard({ id, name, themeName, phase, playerCount }: GameCardProps) {
  const badge = phaseLabel[phase] ?? phaseLabel.lobby;

  return (
    <Link
      href={`/game/${id}`}
      className="flex flex-col gap-2 rounded-xl border border-stone-700 bg-stone-900 p-5
        transition-colors hover:border-stone-500 hover:bg-stone-800"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-stone-100">{name}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-sm text-stone-400">{themeName}</p>
      <p className="text-xs text-stone-500">{playerCount} player{playerCount !== 1 ? 's' : ''}</p>
    </Link>
  );
}
