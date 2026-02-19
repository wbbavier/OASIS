import { GameCard } from './GameCard';

interface GameRow {
  id: string;
  name: string;
  theme_id: string;
  phase: string;
  playerCount: number;
}

interface GameListProps {
  games: GameRow[];
}

const THEME_NAMES: Record<string, string> = {
  'al-rassan': 'The Lions of Al Rassan',
};

export function GameList({ games }: GameListProps) {
  if (games.length === 0) {
    return (
      <div className="rounded-xl border border-stone-700 bg-stone-900 p-10 text-center text-stone-500">
        No games yet — create one!
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {games.map((g) => (
        <GameCard
          key={g.id}
          id={g.id}
          name={g.name}
          themeName={THEME_NAMES[g.theme_id] ?? g.theme_id}
          phase={g.phase}
          playerCount={g.playerCount}
        />
      ))}
    </div>
  );
}
