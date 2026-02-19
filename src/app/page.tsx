'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { GameList } from '@/components/lobby/GameList';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

interface GameRow {
  id: string;
  name: string;
  theme_id: string;
  phase: string;
  playerCount: number;
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [games, setGames] = useState<GameRow[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    async function loadGames() {
      setGamesLoading(true);
      setGamesError(null);

      // Fetch games the current user is a member of
      const { data: playerRows, error: playerError } = await supabase
        .from('game_players')
        .select('game_id')
        .eq('player_id', user!.id);

      if (playerError) {
        setGamesError(playerError.message);
        setGamesLoading(false);
        return;
      }

      const gameIds = (playerRows ?? []).map((r: { game_id: string }) => r.game_id);

      if (gameIds.length === 0) {
        setGames([]);
        setGamesLoading(false);
        return;
      }

      const { data: gameRows, error: gamesError } = await supabase
        .from('games')
        .select('id, name, theme_id, phase')
        .in('id', gameIds)
        .order('created_at', { ascending: false });

      if (gamesError) {
        setGamesError(gamesError.message);
        setGamesLoading(false);
        return;
      }

      // Fetch player counts for each game
      const { data: countRows, error: countError } = await supabase
        .from('game_players')
        .select('game_id')
        .in('game_id', gameIds);

      if (countError) {
        setGamesError(countError.message);
        setGamesLoading(false);
        return;
      }

      const countMap = new Map<string, number>();
      for (const row of countRows ?? []) {
        countMap.set(row.game_id, (countMap.get(row.game_id) ?? 0) + 1);
      }

      setGames(
        (gameRows ?? []).map(
          (g: { id: string; name: string; theme_id: string; phase: string }) => ({
            id: g.id,
            name: g.name,
            theme_id: g.theme_id,
            phase: g.phase,
            playerCount: countMap.get(g.id) ?? 0,
          })
        )
      );
      setGamesLoading(false);
    }

    loadGames();
  }, [user]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size={32} className="text-indigo-400" />
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-100">OASIS</h1>
          <p className="text-stone-400 text-sm">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/create">
            <Button size="sm">Create game</Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace('/auth');
            }}
          >
            Sign out
          </Button>
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-stone-200">Your games</h2>
        {gamesLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size={28} className="text-stone-500" />
          </div>
        ) : gamesError ? (
          <p className="text-sm text-red-400">{gamesError}</p>
        ) : (
          <GameList games={games} />
        )}
      </section>
    </main>
  );
}
