// Game header bar with navigation and status.

import Link from 'next/link';

interface GameHeaderProps {
  gameName: string;
  isGameOver: boolean;
  onRefresh: () => void;
}

export function GameHeader({ gameName, isGameOver, onRefresh }: GameHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-stone-400 hover:text-stone-200">{'\u2190'} Home</Link>
        <h1 className="text-lg font-bold text-stone-100">{gameName}</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
          isGameOver ? 'bg-amber-800 text-amber-200' : 'bg-emerald-800 text-emerald-200'
        }`}>
          {isGameOver ? 'Completed' : 'Active'}
        </span>
        <button onClick={onRefresh} className="text-xs text-stone-500 hover:text-stone-300 underline">
          Refresh
        </button>
      </div>
    </div>
  );
}
