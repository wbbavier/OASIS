'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { ThemePackage } from '@/themes/schema';
import { LobbyRoom } from '@/components/lobby/LobbyRoom';
import { Spinner } from '@/components/ui/Spinner';
import alRassanTheme from '@/themes/al-rassan/theme.json';

const THEME_MAP: Record<string, ThemePackage> = {
  'al-rassan': alRassanTheme as unknown as ThemePackage,
};

interface GameRow {
  id: string;
  name: string;
  theme_id: string;
  phase: string;
  created_by: string;
}

interface PlayerRow {
  player_id: string;
  civilization_id: string;
  profiles: { email: string | null } | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GamePage({ params }: PageProps) {
  const { id: gameId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/auth?next=/game/${gameId}`);
    }
  }, [authLoading, user, router, gameId]);

  useEffect(() => {
    if (!user) return;

    async function loadGame() {
      setLoading(true);
      setError(null);

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('id, name, theme_id, phase, created_by')
        .eq('id', gameId)
        .single();

      if (gameError || !gameData) {
        setError(gameError?.message ?? 'Game not found');
        setLoading(false);
        return;
      }

      const { data: playerData, error: playersError } = await supabase
        .from('game_players')
        .select('player_id, civilization_id, profiles(email)')
        .eq('game_id', gameId);

      if (playersError) {
        setError(playersError.message);
        setLoading(false);
        return;
      }

      setGame(gameData);
      setPlayers((playerData as unknown as PlayerRow[]) ?? []);
      setLoading(false);
    }

    loadGame();
  }, [user, gameId]);

  if (authLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size={32} className="text-indigo-400" />
      </main>
    );
  }

  if (!user) return null;

  if (error || !game) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-400">{error ?? 'Game not found'}</p>
        <Link href="/" className="text-sm text-indigo-400 underline">
          Back to home
        </Link>
      </main>
    );
  }

  const theme = THEME_MAP[game.theme_id];
  if (!theme) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-red-400">Unknown theme: {game.theme_id}</p>
      </main>
    );
  }

  const playerEntries = players.map((p) => ({
    playerId: p.player_id,
    email: p.profiles?.email ?? null,
    civilizationId: p.civilization_id,
  }));

  if (game.phase === 'lobby') {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-stone-400 hover:text-stone-200">
            ← Home
          </Link>
        </div>
        <LobbyRoom
          gameId={game.id}
          gameName={game.name}
          createdBy={game.created_by}
          currentUserId={user.id}
          players={playerEntries}
          theme={theme}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-stone-400 hover:text-stone-200">
            ← Home
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-stone-100">{game.name}</h1>
        </div>
        <span className="rounded bg-emerald-800 px-3 py-1 text-sm font-medium text-emerald-200">
          Active
        </span>
      </div>
      <div className="rounded-xl border border-stone-700 bg-stone-900 p-10 text-center text-stone-400">
        Game in progress — map coming in Phase 3b
      </div>
    </main>
  );
}
