import { Card } from '@/components/ui/Card';

interface PlayerEntry {
  playerId: string | null;
  username: string | null;
  civilizationId: string;
  civColor: string;
  civName: string;
}

interface PlayerListProps {
  players: PlayerEntry[];
  allCivIds: string[];
}

export function PlayerList({ players, allCivIds }: PlayerListProps) {
  const claimedCivIds = new Set(players.map((p) => p.civilizationId));
  const unclaimedCivIds = allCivIds.filter((id) => !claimedCivIds.has(id));

  return (
    <Card>
      <h3 className="mb-3 font-semibold text-stone-200">Players</h3>
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.civilizationId} className="flex items-center gap-3">
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: p.civColor }}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-stone-300">{p.civName}</span>
            <span className="ml-auto text-sm text-stone-400">
              {p.username ?? 'Player'}
            </span>
          </li>
        ))}
        {unclaimedCivIds.map((civId) => (
          <li key={civId} className="flex items-center gap-3">
            <span className="h-3 w-3 flex-shrink-0 rounded-full bg-stone-600" aria-hidden="true" />
            <span className="text-sm font-medium text-stone-500">{civId}</span>
            <span className="ml-auto rounded bg-stone-700 px-2 py-0.5 text-xs text-stone-400">
              AI
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
