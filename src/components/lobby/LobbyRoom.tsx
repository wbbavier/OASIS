'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ThemePackage } from '@/themes/schema';
import { supabase } from '@/lib/supabase';
import { generateGameSeed, initializeGameState } from '@/lib/game-initializer';
import { InvitePanel } from './InvitePanel';
import { PlayerList } from './PlayerList';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

interface GamePlayer {
  playerId: string;
  email: string | null;
  civilizationId: string;
}

interface LobbyRoomProps {
  gameId: string;
  gameName: string;
  createdBy: string;
  currentUserId: string;
  players: GamePlayer[];
  theme: ThemePackage;
}

export function LobbyRoom({
  gameId,
  gameName,
  createdBy,
  currentUserId,
  players,
  theme,
}: LobbyRoomProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreator = currentUserId === createdBy;
  const allCivIds = theme.civilizations.map((c) => c.id);

  const playerEntries = players.map((p) => {
    const civDef = theme.civilizations.find((c) => c.id === p.civilizationId);
    return {
      playerId: p.playerId,
      email: p.email,
      civilizationId: p.civilizationId,
      civColor: civDef?.color ?? '#888',
      civName: civDef?.name ?? p.civilizationId,
    };
  });

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const seed = generateGameSeed(gameId);
      const playerMappings = players.map((p) => ({
        civId: p.civilizationId,
        playerId: p.playerId,
      }));
      const gameState = initializeGameState(
        gameId,
        theme,
        playerMappings,
        seed,
        new Date().toISOString()
      );
      const { error: updateError } = await supabase
        .from('games')
        .update({
          game_state: gameState as unknown as Record<string, unknown>,
          phase: 'active',
        })
        .eq('id', gameId);
      if (updateError) throw new Error(updateError.message);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game');
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-100">{gameName}</h1>
        <span className="rounded bg-yellow-800 px-3 py-1 text-sm font-medium text-yellow-200">
          Lobby
        </span>
      </div>

      <PlayerList players={playerEntries} allCivIds={allCivIds} />
      <InvitePanel gameId={gameId} />

      {isCreator && (
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleStart}
            disabled={starting || players.length === 0}
            size="md"
          >
            {starting ? (
              <span className="flex items-center gap-2">
                <Spinner size={16} /> Starting…
              </span>
            ) : (
              'Start Game'
            )}
          </Button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <p className="text-xs text-stone-500">
            Empty civilization slots will be controlled by AI.
          </p>
        </div>
      )}
    </div>
  );
}
